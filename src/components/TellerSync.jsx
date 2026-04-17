import { useState, useEffect } from 'react'
import Spinner from './Spinner'
import { useTellerConnect } from 'teller-connect-react'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { functions, db } from '../firebase'

const storeTellerEnrollment = httpsCallable(functions, 'storeTellerEnrollment')
const getTellerTransactions  = httpsCallable(functions, 'getTellerTransactions')
const selectTellerAccount    = httpsCallable(functions, 'selectTellerAccount')
const disconnectTeller       = httpsCallable(functions, 'disconnectTeller')

const TELLER_APP_ID = 'app_pr4hc80mpvbhp573su000'

export default function TellerSync({ uid, existingTellerIds, onAddActivity, onCancel }) {
  const [connected, setConnected] = useState(null) // null = loading
  const [institution, setInstitution] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [selectedAccountNames, setSelectedAccountNames] = useState([])
  const [accounts, setAccounts] = useState(null) // null = not yet fetched
  const [pickerSelection, setPickerSelection] = useState(new Set()) // checked in picker
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState(null) // { error }
  const [disconnecting, setDisconnecting] = useState(false)
  const [saving, setSaving] = useState(false) // true while storeTellerEnrollment is in-flight

  // Watch Firestore for teller connection state
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const teller = snap.data()?.teller
      setConnected(!!teller?.accessToken)
      setInstitution(teller?.institutionName || '')
      setSelectedAccountIds(teller?.selectedAccountIds || [])
      setSelectedAccountNames(teller?.selectedAccountNames || [])
    })
    return unsub
  }, [uid])

  // Auto-fetch accounts when connected but no card selected yet
  useEffect(() => {
    if (connected && selectedAccountIds.length === 0) {
      handleFetchAccounts()
    }
  }, [connected])


  const { open, ready } = useTellerConnect({
    applicationId: TELLER_APP_ID,
    environment: 'development',
    onSuccess: async (enrollment) => {
      const accessToken = enrollment.accessToken
      const institutionName =
        enrollment.institution?.name ||
        enrollment.enrollment?.institution?.name ||
        enrollment.user?.institution?.name ||
        ''
      if (!institutionName.toLowerCase().includes('bank of america')) {
        setStatus({ error: `Only Bank of America accounts are supported. You connected "${institutionName || 'an unsupported institution'}".` })
        return
      }
      // Wait for Firestore write before setting local state —
      // the useEffect auto-fetch depends on the token being in Firestore
      setSaving(true)
      try {
        await storeTellerEnrollment({ accessToken, institutionName })
      } catch (err) {
        console.error('storeTellerEnrollment failed:', err)
        setStatus({ error: `Failed to save connection: ${err.message}` })
      } finally {
        setSaving(false)
      }
    },
    onExit: () => {},
  })

  async function handleFetchAccounts() {
    setSyncing(true)
    try {
      const result = await getTellerTransactions({})
      const { accounts: fetchedAccounts } = result.data
      console.log('Teller credit accounts:', fetchedAccounts.map(a => a.name))
      const alaskaAccounts = fetchedAccounts.filter(a => {
        const n = a.name.toLowerCase()
        return n.includes('alaska') || n.includes('atmos') || n.includes('ascent')
      })
      if (alaskaAccounts.length === 0) {
        setAccounts([]) // triggers "no Atmos cards found" error in UI
        return
      }
      if (alaskaAccounts.length === 1) {
        // Auto-select if only one Atmos card
        await selectTellerAccount({
          accountIds: [alaskaAccounts[0].id],
          accountNames: [alaskaAccounts[0].name],
        })
      } else {
        setAccounts(alaskaAccounts)
        setPickerSelection(new Set(alaskaAccounts.map(a => a.id))) // default all checked
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
    await selectTellerAccount({
      accountIds: chosen.map(a => a.id),
      accountNames: chosen.map(a => a.name),
    })
    setAccounts(null)
  }

  async function handleSync() {
    setSyncing(true)
    setStatus(null)
    try {
      const result = await getTellerTransactions({})
      const { transactions } = result.data

      let added = 0
      let skipped = 0

      for (const tx of transactions) {
        // Skip credit card bill payments (type=payment) — not purchases or returns
        const isPayment = tx.type === 'payment' ||
          /ba electronic payment|online\/mobile payment/i.test(tx.description)
        if (isPayment) { skipped++; continue }
        // Skip pending transactions — wait until they post
        if (tx.status === 'pending') { skipped++; continue }
        // Skip already-imported transactions
        if (existingTellerIds?.has(tx.id)) { skipped++; continue }

        const txYear = parseInt(tx.date.slice(0, 4))

        await onAddActivity({
          type: 'card_spend',
          date: tx.date,
          amount: tx.amount,
          notes: tx.description,
          tellerTxId: tx.id,
          source: 'teller',
          year: txYear,
        })
        added++
      }

      if (added > 0) {
        onCancel()
      } else {
        setStatus({ info: `Already up to date — ${skipped} transaction${skipped !== 1 ? 's' : ''} skipped (payments, pending, or already imported).` })
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
      await disconnectTeller()
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setDisconnecting(false)
    }
  }

  // Loading state while Firestore resolves or enrollment is saving
  if (connected === null || saving) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!connected ? (
        <>
          <p className="text-sm text-slate-600">
            Connect your Alaska Airlines credit card to automatically sync transactions as status point entries.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
            <p>• Read-only access — we can never move money or make changes</p>
            <p>• Powered by Teller, a bank-grade financial data provider</p>
            <p>• Only credit card transactions are fetched</p>
          </div>
          {status?.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {status.error}
            </div>
          )}
          <button
            onClick={() => open()}
            disabled={!ready}
            className="w-full bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            💳 Connect Atmos Card
          </button>
          <button
            onClick={onCancel}
            className="w-full border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <span className="text-green-600 text-xl">✓</span>
            <div>
              <p className="font-medium text-green-900 text-sm">{institution || 'Bank of America'} connected</p>
              {(selectedAccountNames.length > 0 || syncing) && (
                <p className="text-xs text-green-700">
                  {selectedAccountNames.length > 0 ? selectedAccountNames.join(' · ') : 'Finding your card…'}
                </p>
              )}
            </div>
          </div>

          {status?.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {status.error}
            </div>
          )}
          {status?.info && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
              {status.info}
            </div>
          )}

          {/* Account picker */}
          {accounts && (
            accounts.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                No Alaska Airlines cards found. Only Alaska Atmos and Ascent cards are supported.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Select which Atmos Card(s) to sync:</p>
                {accounts.map(a => (
                  <label key={a.id} className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-alaska-blue hover:bg-alaska-blue/5 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pickerSelection.has(a.id)}
                      onChange={e => {
                        const next = new Set(pickerSelection)
                        e.target.checked ? next.add(a.id) : next.delete(a.id)
                        setPickerSelection(next)
                      }}
                      className="rounded border-slate-300 text-alaska-blue focus:ring-alaska-blue"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-800">{a.name}</span>
                      {a.last4 && <span className="text-xs text-slate-400 ml-2">···· {a.last4}</span>}
                    </div>
                  </label>
                ))}
                <button
                  onClick={handleConfirmAccounts}
                  disabled={pickerSelection.size === 0}
                  className="w-full bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors"
                >
                  Confirm
                </button>
              </div>
            )
          )}

          {!accounts && selectedAccountIds.length === 0 && !status?.error && (
            <div className="flex justify-center py-2">
              <Spinner size="md" />
            </div>
          )}
          {!accounts && selectedAccountIds.length === 0 && status?.error && (
            <button
              onClick={handleFetchAccounts}
              className="w-full border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Retry
            </button>
          )}

          {selectedAccountIds.length > 0 && !accounts && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="w-full bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {syncing
                ? <><Spinner size="sm" color="white" /> Syncing…</>
                : '💳 Sync Transactions'}
            </button>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex-1 border border-red-200 text-red-600 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
