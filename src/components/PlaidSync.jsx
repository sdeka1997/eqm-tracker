import { useState, useEffect, useCallback } from 'react'
import Spinner from './Spinner'
import { usePlaidLink } from 'react-plaid-link'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { functions, db } from '../firebase'

const createLinkToken   = httpsCallable(functions, 'createPlaidLinkToken')
const exchangeToken     = httpsCallable(functions, 'exchangePlaidPublicToken')
const getTransactions   = httpsCallable(functions, 'getPlaidTransactions')
const selectAccount     = httpsCallable(functions, 'selectPlaidAccount')
const disconnect        = httpsCallable(functions, 'disconnectPlaid')

// Bill payments and card-level credits are not spend. Plaid's own category is
// the primary signal; the description patterns are a backstop for issuers whose
// payment rows come through uncategorised.
const PAYMENT_CATEGORIES = new Set(['LOAN_PAYMENTS', 'TRANSFER_OUT', 'TRANSFER_IN'])
const PAYMENT_PATTERNS = [
  /online\/mobile\s+(payment|recurring)/i,
  /ba electronic payment/i,
  /automated phone payment/i,
  /payment\s*-\s*thank you/i,
  /^payment\b/i,
]

function isPayment(tx) {
  if (PAYMENT_CATEGORIES.has(tx.category)) return true
  return PAYMENT_PATTERNS.some(re => re.test(tx.description || ''))
}

export default function PlaidSync({
  uid, year, existingPlaidIds, latestCardDate, onAddActivity, onCancel,
}) {
  const [connected, setConnected] = useState(null) // null = loading
  const [institution, setInstitution] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [accounts, setAccounts] = useState(null)
  const [pickerSelection, setPickerSelection] = useState(new Set())
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linkToken, setLinkToken] = useState(null)

  // Everything on or before this date is assumed already imported (the Teller
  // era). Editable, because the right cutoff depends on what is already stored.
  // Derived from posted card_spend rows only — the anniversary bonus is a
  // different activity type and never moves this date.
  const [cutoff, setCutoff] = useState(latestCardDate || '')
  const [cutoffEdited, setCutoffEdited] = useState(false)

  // Activities stream in after mount, so adopt the real newest date when it
  // arrives rather than latching whatever was known at first render.
  useEffect(() => {
    if (!cutoffEdited && latestCardDate) setCutoff(latestCardDate)
  }, [latestCardDate, cutoffEdited])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const plaid = snap.data()?.plaid
      setConnected(!!plaid?.accessToken)
      setInstitution(plaid?.institutionName || '')
      setSelectedAccountIds(plaid?.selectedAccountIds || [])
    })
    return unsub
  }, [uid])

  // Link needs a token before it can open, so fetch one whenever disconnected.
  useEffect(() => {
    if (connected === false && !linkToken) {
      createLinkToken()
        .then(res => setLinkToken(res.data.linkToken))
        .catch(err => setStatus({ error: `Could not start Plaid Link: ${err.message}` }))
    }
  }, [connected, linkToken])

  useEffect(() => {
    if (connected && selectedAccountIds.length === 0) handleFetchAccounts()
  }, [connected])

  const onLinkSuccess = useCallback(async (publicToken, metadata) => {
    setSaving(true)
    try {
      await exchangeToken({ publicToken, institutionName: metadata?.institution?.name || '' })
      setLinkToken(null)
    } catch (err) {
      setStatus({ error: `Failed to save connection: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onLinkSuccess,
    onExit: () => {},
  })

  async function handleFetchAccounts() {
    setSyncing(true)
    try {
      const { data } = await getTransactions({ startDate: cutoff || undefined })
      const fetched = data.accounts || []
      if (fetched.length === 0) { setAccounts([]); return }
      if (fetched.length === 1) {
        await selectAccount({ accountIds: [fetched[0].id], accountNames: [fetched[0].name] })
      } else {
        setAccounts(fetched)
        setPickerSelection(new Set(fetched.map(a => a.id)))
      }
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  async function handleConfirmAccounts() {
    const chosen = accounts.filter(a => pickerSelection.has(a.id))
    if (chosen.length === 0) return
    await selectAccount({
      accountIds: chosen.map(a => a.id),
      accountNames: chosen.map(a => a.name),
    })
    setAccounts(null)
  }

  async function handleSync() {
    setSyncing(true)
    setStatus(null)
    try {
      // Start the day after the cutoff so the last imported day is not re-added.
      const start = cutoff
        ? new Date(new Date(`${cutoff}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10)
        : undefined
      const { data } = await getTransactions({ startDate: start })
      const transactions = data.transactions || []

      let added = 0
      const skips = { payment: 0, pending: 0, imported: 0, otherYear: 0 }
      const otherYears = new Set()

      for (const tx of transactions) {
        if (isPayment(tx))                    { skips.payment++;  continue }
        if (tx.status === 'pending')          { skips.pending++;  continue }
        if (existingPlaidIds?.has(tx.id))     { skips.imported++; continue }

        const txYear = parseInt(tx.date.slice(0, 4))
        if (txYear !== year) { skips.otherYear++; otherYears.add(txYear); continue }

        await onAddActivity({
          type: 'card_spend',
          date: tx.date,
          amount: tx.amount,
          notes: tx.description,
          plaidTxId: tx.id,
          source: 'plaid',
          year: txYear,
        })
        added++
      }

      if (added > 0) {
        onCancel()
      } else {
        const parts = []
        if (skips.imported)  parts.push(`${skips.imported} already imported`)
        if (skips.payment)   parts.push(`${skips.payment} bill payments`)
        if (skips.pending)   parts.push(`${skips.pending} still pending`)
        if (skips.otherYear) parts.push(`${skips.otherYear} from ${[...otherYears].sort().join(', ')}`)
        setStatus({
          info: transactions.length === 0
            ? `Plaid returned no transactions after ${start || 'the start of history'}.`
            : `No new transactions for ${year}. Of ${transactions.length} fetched: ${parts.join(', ')}.`,
        })
      }
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await disconnect()
      setLinkToken(null)
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setDisconnecting(false)
    }
  }

  if (connected === null || saving) {
    return <div className="py-8 flex justify-center"><Spinner /></div>
  }

  if (!connected) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1.5">
          <p className="font-semibold text-slate-800">Connect your card</p>
          <p>Plaid links your card read-only and imports posted transactions into your Card Spend totals.</p>
        </div>
        {status?.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{status.error}</div>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() => open()}
            disabled={!ready || !linkToken}
            className="flex-1 bg-alaska-teal hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            {linkToken ? 'Connect Bank' : 'Preparing…'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-2">
        <span className="text-green-600">✓</span>
        <div>
          <p className="text-sm font-medium text-slate-800">{institution || 'Bank'} connected</p>
          {selectedAccountIds.length > 0 && (
            <p className="text-xs text-slate-500">{selectedAccountIds.length} card{selectedAccountIds.length !== 1 ? 's' : ''} selected</p>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
        <label className="block font-medium text-slate-600 mb-1.5">Import transactions after</label>
        <input
          type="date"
          value={cutoff}
          onChange={e => { setCutoff(e.target.value); setCutoffEdited(true) }}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-alaska-blue"
        />
        <p className="mt-1.5 text-slate-400">
          Everything on or before this date is treated as already imported, so the
          Teller-era history is not duplicated.
        </p>
      </div>

      {status?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{status.error}</div>
      )}
      {status?.info && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">{status.info}</div>
      )}

      {accounts && (
        accounts.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
            No credit card accounts found on this connection.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map(a => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700 border border-slate-200 rounded-xl px-3 py-2">
                <input
                  type="checkbox"
                  checked={pickerSelection.has(a.id)}
                  onChange={e => {
                    const next = new Set(pickerSelection)
                    e.target.checked ? next.add(a.id) : next.delete(a.id)
                    setPickerSelection(next)
                  }}
                />
                <span className="flex-1">{a.name}</span>
                {a.last4 && <span className="text-xs text-slate-400">···{a.last4}</span>}
              </label>
            ))}
            <button onClick={handleConfirmAccounts} className="w-full bg-alaska-teal text-white py-2.5 rounded-xl text-sm font-semibold">
              Use selected
            </button>
          </div>
        )
      )}

      <button
        onClick={handleSync}
        disabled={syncing}
        className="w-full bg-alaska-blue hover:bg-blue-800 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {syncing ? <Spinner size="sm" /> : '💳'} Sync Transactions
      </button>

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
          Close
        </button>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex-1 border border-red-200 text-red-500 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-40"
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  )
}
