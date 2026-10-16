import { useState } from 'react'
import { calculateCardPoints, getToday } from '../utils/calculations'
import { INPUT_CLS, LABEL_CLS } from '../utils/styles'

function ProjectionForm({ onSubmit, onCancel, onDone, modeToggle }) {
  const [notes, setNotes] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(getToday())
  const [added, setAdded] = useState([])

  const value = parseFloat(amount) || 0
  const canAdd = value > 0 && !!date

  async function save() {
    const entry = { type: 'card_projection', date, amount: value, notes: notes.trim() }
    await onSubmit(entry)
    setAdded(a => [...a, entry])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (canAdd) await save()
    onDone?.()
  }

  async function handleAddAnother() {
    await save()
    setNotes('')
    setAmount('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {modeToggle}
      <p className="text-xs text-slate-500 -mt-1">
        A purchase you expect to make. It counts as planned until you match it to the real charge once that syncs.
      </p>

      {added.length > 0 && (
        <ul className="text-xs space-y-1">
          {added.map((a, i) => (
            <li key={i} className="flex justify-between text-slate-500 border border-dashed border-slate-200 rounded-lg px-2.5 py-1.5">
              <span className="truncate">✓ {a.notes || 'Projected spend'} · {a.date}</span>
              <span className="shrink-0 ml-2">${a.amount.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className={LABEL_CLS}>What is it?</label>
        <input
          className={INPUT_CLS}
          placeholder="e.g. Property tax payment"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Amount ($)</label>
          <input
            type="number" min="0" step="0.01"
            className={INPUT_CLS}
            placeholder="e.g. 500"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Expected date</label>
          <input
            type="date"
            className={INPUT_CLS}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="border border-dashed border-alaska-blue/40 rounded-xl p-3 bg-alaska-blue/5 text-center">
        {value > 0 ? (
          <>
            <div className="text-lg font-bold text-alaska-blue">+{calculateCardPoints(value).toLocaleString()} SP</div>
            <div className="text-xs text-slate-500">planned</div>
          </>
        ) : (
          <p className="text-xs text-slate-400">Enter an amount to see points</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
          {added.length > 0 ? 'Close' : 'Cancel'}
        </button>
        <button type="button" onClick={handleAddAnother} disabled={!canAdd} className="flex-1 border border-alaska-blue/40 text-alaska-blue disabled:opacity-40 py-2.5 rounded-xl text-sm font-semibold hover:bg-alaska-blue/5 transition-colors">
          Add another
        </button>
        <button type="submit" disabled={!canAdd} className="flex-1 bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
          Add
        </button>
      </div>
    </form>
  )
}

const ANNIVERSARY_BONUS_SP = 10000

function AnniversaryForm({ onSubmit, onCancel, onDone, modeToggle }) {
  const [date, setDate] = useState(getToday())

  async function handleSubmit(e) {
    e.preventDefault()
    await onSubmit({ type: 'anniversary_bonus', date, notes: 'Summit card anniversary bonus', statusPoints: ANNIVERSARY_BONUS_SP })
    onDone?.()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {modeToggle}
      <p className="text-xs text-slate-500 -mt-1">
        The Summit card's yearly bonus. A future date counts as planned until it arrives.
      </p>
      <div>
        <label className={LABEL_CLS}>Anniversary date</label>
        <input type="date" className={INPUT_CLS} value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="border border-dashed border-alaska-teal/40 rounded-xl p-3 bg-alaska-teal/5 text-center">
        <div className="text-lg font-bold text-alaska-teal">+{ANNIVERSARY_BONUS_SP.toLocaleString()} SP</div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={!date} className="flex-1 bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
          Add
        </button>
      </div>
    </form>
  )
}

// Real card spend comes only from sync, so adding by hand is for planning:
// purchases you expect to make, or the card's anniversary bonus.
export default function CardSpendForm({ onSubmit, onCancel, onDone }) {
  const [mode, setMode] = useState('purchase')

  const modeToggle = (
    <div className="flex bg-slate-100 rounded-xl p-1 text-sm font-medium">
      {[['purchase', 'Planned purchase'], ['anniversary', 'Anniversary bonus']].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${mode === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const Form = mode === 'purchase' ? ProjectionForm : AnniversaryForm
  return <Form onSubmit={onSubmit} onCancel={onCancel} onDone={onDone} modeToggle={modeToggle} />
}
