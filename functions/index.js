const { onCall } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const https = require('https')
const axios = require('axios')

admin.initializeApp()

const TELLER_CERT = defineSecret('TELLER_CERT')
const TELLER_KEY = defineSecret('TELLER_KEY')

// Called after Teller Connect succeeds on the frontend.
// Stores the enrollment access token securely in Firestore.
exports.storeTellerEnrollment = onCall({ secrets: [TELLER_CERT, TELLER_KEY] }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')
  const { accessToken, institutionName } = request.data
  if (!accessToken) throw new Error('Missing accessToken')

  await admin.firestore().collection('users').doc(request.auth.uid).set({
    teller: { accessToken, institutionName, connectedAt: Date.now() },
  }, { merge: true })

  return { success: true }
})

// Fetches credit card transactions from Teller for the authenticated user.
// Returns raw transactions — the frontend converts them to SP entries.
exports.getTellerTransactions = onCall({ secrets: [TELLER_CERT, TELLER_KEY] }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')

  const userSnap = await admin.firestore().collection('users').doc(request.auth.uid).get()
  const teller = userSnap.data()?.teller
  if (!teller?.accessToken) throw new Error('No Teller account connected')

  const agent = new https.Agent({
    cert: TELLER_CERT.value(),
    key: TELLER_KEY.value(),
  })

  // Fetch all accounts
  const accountsRes = await axios.get('https://api.teller.io/accounts', {
    httpsAgent: agent,
    auth: { username: teller.accessToken, password: '' },
  })

  // Filter to credit card accounts only
  const creditAccounts = accountsRes.data.filter(a => a.type === 'credit')
  if (creditAccounts.length === 0) return { transactions: [], accounts: [] }

  // Filter to selected accounts if any are saved
  const selectedAccountIds = teller.selectedAccountIds || []
  const accountsToSync = selectedAccountIds.length > 0
    ? creditAccounts.filter(a => selectedAccountIds.includes(a.id))
    : creditAccounts

  const allTransactions = []
  for (const account of accountsToSync) {
    const txRes = await axios.get(`https://api.teller.io/accounts/${account.id}/transactions`, {
      httpsAgent: agent,
      auth: { username: teller.accessToken, password: '' },
    })
    for (const tx of txRes.data) {
      // Only sync 2026 and later — 2025 is read-only (spreadsheet import)
      if (parseInt(tx.date.slice(0, 4)) < 2026) continue
      allTransactions.push({
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: parseFloat(tx.amount),
        status: tx.status,
        type: tx.type || null,
        accountId: account.id,
        accountName: account.name,
        institutionName: account.institution.name,
      })
    }
  }

  // Sort newest first
  allTransactions.sort((a, b) => b.date.localeCompare(a.date))

  return {
    transactions: allTransactions,
    accounts: creditAccounts.map(a => ({ id: a.id, name: a.name, last4: a.last_four })),
    selectedAccountIds: selectedAccountIds,
  }
})

// Saves the user's selected credit card accounts for syncing.
exports.selectTellerAccount = onCall(async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')
  const { accountIds, accountNames } = request.data
  await admin.firestore().collection('users').doc(request.auth.uid).update({
    'teller.selectedAccountIds': accountIds,
    'teller.selectedAccountNames': accountNames,
  })
  return { success: true }
})

// Removes Teller connection for the authenticated user.
exports.disconnectTeller = onCall(async (request) => {
  if (!request.auth) throw new Error('Unauthenticated')
  await admin.firestore().collection('users').doc(request.auth.uid).update({
    teller: admin.firestore.FieldValue.delete(),
  })
  return { success: true }
})
