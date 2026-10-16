import { useState, useEffect } from 'react'
import { getToday } from '../utils/calculations'
import Spinner from './Spinner'

// Simulated card sync for demo mode: plays out a Plaid fetch, then "finds" a
// few new transactions posted today. Like the real sync, it skips bill
// payments and pending charges, and adds the rest straight to card spend.

const NEW_TRANSACTIONS = [
  { id: 'demo-tx-1', notes: 'Alaska Airlines', amount: 412.3 },
  { id: 'demo-tx-2', notes: 'Safeway', amount: 86.45 },
  { id: 'demo-tx-3', notes: 'Chevron', amount: 52.1 },
]
const SKIPPED = '1 bill payment and 1 pending charge skipped'

const PHASES = [
  { text: 'Connecting to your card through Plaid…', ms: 800 },
  { text: 'Fetching transactions since the last sync…', ms: 1200 },
  { text: 'Skipping bill payments and pending charges…', ms: 800 },
]

const money = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DemoCardSync({ activities, onAddActivity, onSynced, onClose }) {
  const [phase, setPhase] = useState(0)
  const today = getToday()
  const [found] = useState(() => {
    const imported = new Set(activities.map(a => a.plaidTxId).filter(Boolean))
    return NEW_TRANSACTIONS.filter(t => !imported.has(t.id))
  })

  // Monthly rounding means the SP gain is the change in this month's total.
  const monthSpend = activities
    .filter(a => a.type === 'card_spend' && (a.date || '').slice(0, 7) === today.slice(0, 7))
    .reduce((sum, a) => sum + (a.amount || 0), 0)
  const addedSpend = found.reduce((sum, t) => sum + t.amount, 0)
  const addedSP = Math.round((monthSpend + addedSpend) / 2) - Math.round(monthSpend / 2)

  useEffect(() => {
    if (phase >= PHASES.length) return
    const t = setTimeout(() => setPhase(p => p + 1), PHASES[phase].ms)
    return () => clearTimeout(t)
  }, [phase])

  async function handleImport() {
    for (const t of found) {
      await onAddActivity({
        type: 'card_spend',
        date: today,
        amount: t.amount,
        notes: t.notes,
        plaidTxId: t.id,
        source: 'plaid',
      })
    }
    onSynced({ count: found.length, spend: addedSpend, points: addedSP })
    onClose()
  }

  // Nothing new still counts as a finished sync, so the tour never waits forever.
  function handleClose() {
    if (!scanning && found.length === 0) onSynced({ count: 0, spend: 0, points: 0 })
    onClose()
  }

  const scanning = phase < PHASES.length

  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
        Demo: this is a simulated sync. Signed-in users link their Atmos card through Plaid.
      </p>

      <ul className="space-y-2">
        {PHASES.map((p, i) => (
          <li key={p.text} className={`flex items-center gap-2 text-sm ${i <= phase ? 'text-slate-700' : 'text-slate-300'}`}>
            <span className="w-4 flex justify-center">
              {i < phase ? <span className="text-green-600">✓</span> : i === phase ? <Spinner size="sm" /> : '·'}
            </span>
            {p.text}
          </li>
        ))}
      </ul>

      {!scanning && (found.length > 0 ? (
        <div className="border-2 border-green-200 bg-green-50/50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-green-700 font-medium">{found.length} new transactions</p>
            <p className="text-xs font-bold text-alaska-blue">+{addedSP.toLocaleString()} SP</p>
          </div>
          <ul className="divide-y divide-green-100">
            {found.map(t => (
              <li key={t.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-700">{t.notes}</span>
                <span className="text-slate-500">{money(t.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400">{SKIPPED}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-2">No new transactions since the last sync.</p>
      ))}

      <div className="flex gap-2">
        <button
          onClick={handleClose}
          className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50"
        >
          {found.length ? 'Cancel' : 'Close'}
        </button>
        {found.length > 0 && (
          <button
            onClick={handleImport}
            disabled={scanning}
            className="flex-1 bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Import
          </button>
        )}
      </div>
    </div>
  )
}
