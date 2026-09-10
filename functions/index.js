const { onCall } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')

admin.initializeApp()

// ─── Plaid ────────────────────────────────────────────────────────────────────
// Card transaction sync. Replaces Teller, whose API was withdrawn in July 2026.
// Note that Plaid never hands the client a usable token: Link returns a
// short-lived public_token which must be exchanged server-side for the real
// access_token, so connecting takes three calls rather than one.

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')

const PLAID_CLIENT_ID = defineSecret('PLAID_CLIENT_ID')
const PLAID_SECRET = defineSecret('PLAID_SECRET')

function plaidClient() {
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments.production,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID.value(),
        'PLAID-SECRET': PLAID_SECRET.value(),
      },
    },
  }))
}

const PLAID_SECRETS = [PLAID_CLIENT_ID, PLAID_SECRET]

// Step 1 of the Link flow: the client needs a link_token before it can open Link.
exports.createPlaidLinkToken = onCall({ secrets: PLAID_SECRETS }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')

  const res = await plaidClient().linkTokenCreate({
    user: { client_user_id: request.auth.uid },
    client_name: 'Atmos SP Tracker',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  })
  return { linkToken: res.data.link_token }
})

// Step 2: swap the public_token Link returned for a durable access_token.
exports.exchangePlaidPublicToken = onCall({ secrets: PLAID_SECRETS }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')
  const { publicToken, institutionName } = request.data
  if (!publicToken) throw new Error('Missing publicToken')

  const res = await plaidClient().itemPublicTokenExchange({ public_token: publicToken })

  await admin.firestore().collection('users').doc(request.auth.uid).set({
    plaid: {
      accessToken: res.data.access_token,
      itemId: res.data.item_id,
      institutionName: institutionName || '',
      connectedAt: Date.now(),
    },
  }, { merge: true })

  return { success: true }
})

// Fetches credit card transactions. Returns raw rows and lets the frontend
// convert them to SP entries.
exports.getPlaidTransactions = onCall({ secrets: PLAID_SECRETS }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')

  const userSnap = await admin.firestore().collection('users').doc(request.auth.uid).get()
  const plaid = userSnap.data()?.plaid
  if (!plaid?.accessToken) throw new Error('No Plaid account connected')

  const client = plaidClient()
  const accountsRes = await client.accountsGet({ access_token: plaid.accessToken })
  const creditAccounts = accountsRes.data.accounts.filter(a => a.type === 'credit')
  if (creditAccounts.length === 0) return { transactions: [], accounts: [] }

  // Plaid rejects an empty account_ids array, so never let the intersection of
  // "saved selection" and "accounts this Item actually returns" produce one.
  // They can diverge if the Item is re-linked, since account ids are reissued.
  const selectedAccountIds = plaid.selectedAccountIds || []
  const matched = creditAccounts
    .filter(a => selectedAccountIds.includes(a.account_id))
    .map(a => a.account_id)
  const accountIds = matched.length > 0 ? matched : creditAccounts.map(a => a.account_id)

  // Default to two years back, which is Plaid's standard history depth.
  const { startDate, endDate } = request.data || {}
  const end = endDate || new Date().toISOString().slice(0, 10)
  const start = startDate ||
    new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)

  const nameById = Object.fromEntries(creditAccounts.map(a => [a.account_id, a.name]))
  const allTransactions = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const txRes = await client.transactionsGet({
      access_token: plaid.accessToken,
      start_date: start,
      end_date: end,
      options: { account_ids: accountIds, count: 500, offset },
    })
    total = txRes.data.total_transactions
    for (const tx of txRes.data.transactions) {
      allTransactions.push({
        id: tx.transaction_id,
        date: tx.date,
        description: tx.merchant_name || tx.name || '',
        // Plaid: positive means money out, so a card purchase is positive and a
        // refund negative, matching how existing card_spend rows are stored.
        amount: tx.amount,
        status: tx.pending ? 'pending' : 'posted',
        category: tx.personal_finance_category?.primary || null,
        accountId: tx.account_id,
        accountName: nameById[tx.account_id] || '',
      })
    }
    offset += txRes.data.transactions.length
    if (txRes.data.transactions.length === 0) break
  }

  allTransactions.sort((a, b) => b.date.localeCompare(a.date))

  return {
    transactions: allTransactions,
    accounts: creditAccounts.map(a => ({ id: a.account_id, name: a.name, last4: a.mask })),
    selectedAccountIds,
    range: { start, end },
  }
})

exports.selectPlaidAccount = onCall(async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')
  const { accountIds, accountNames } = request.data
  await admin.firestore().collection('users').doc(request.auth.uid).update({
    'plaid.selectedAccountIds': accountIds,
    'plaid.selectedAccountNames': accountNames,
  })
  return { success: true }
})

exports.disconnectPlaid = onCall({ secrets: PLAID_SECRETS }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')
  const ref = admin.firestore().collection('users').doc(request.auth.uid)
  const plaid = (await ref.get()).data()?.plaid
  // Release the Item at Plaid too — on a Trial plan the slot is not returned,
  // but leaving orphaned Items connected serves no purpose.
  if (plaid?.accessToken) {
    try { await plaidClient().itemRemove({ access_token: plaid.accessToken }) }
    catch (e) { console.warn('itemRemove failed:', e.message) }
  }
  await ref.update({ plaid: admin.firestore.FieldValue.delete() })
  return { success: true }
})
