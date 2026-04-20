import { useState } from 'react'
import { calculateCardPoints, getToday } from '../utils/calculations'
import { INPUT_CLS, LABEL_CLS } from '../utils/styles'

export default function CardSpendForm({ onSubmit, onCancel, onDone }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(getToday())
  const [isAnniversary, setIsAnniversary] = useState(false)

  const spendPoints = calculateCardPoints(parseFloat(amount) || 0)
  const totalPoints = spendPoints + (isAnniversary ? 10000 : 0)

  const inputCls = INPUT_CLS
  const labelCls = LABEL_CLS

  function handleSubmit(e) {
    e.preventDefault()
    const entries = []

    if (parseFloat(amount) > 0) {
      entries.push({
        type: 'card_spend',
        date,
        amount: parseFloat(amount),
        notes,
        statusPoints: spendPoints,
      })
    }

    if (isAnniversary) {
      entries.push({
        type: 'anniversary_bonus',
        date,
        notes: 'Summit card anniversary bonus',
        statusPoints: 10000,
      })
    }

    entries.forEach(onSubmit)
    if (onDone) onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Spend Amount ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className={inputCls}
          placeholder="e.g. 1500.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1">Summit card: 1 SP per $2 spent</p>
      </div>

      <div>
        <label className={labelCls}>Date</label>
        <input
          type="date"
          className={inputCls}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>Notes (optional)</label>
        <input
          className={inputCls}
          placeholder="e.g. January statement"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Anniversary bonus */}
      <div className="border border-dashed border-alaska-teal/40 rounded-xl p-3 bg-alaska-teal/5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAnniversary}
            onChange={(e) => setIsAnniversary(e.target.checked)}
            className="rounded border-slate-300 text-alaska-teal focus:ring-alaska-teal"
          />
          <div>
            <span className="text-sm font-medium text-slate-700">Add your Summit card anniversary bonus</span>
          </div>
        </label>
      </div>

      {/* Points preview */}
      <div className="bg-alaska-blue/5 border border-alaska-blue/20 rounded-xl p-3">
        <div className="flex justify-between items-center">
          {amount && parseFloat(amount) > 0 && (
            <div className="text-center flex-1">
              <div className="text-lg font-bold text-alaska-blue">+{spendPoints.toLocaleString()}</div>
              <div className="text-xs text-slate-500">From spend</div>
            </div>
          )}
          {isAnniversary && (
            <div className="text-center flex-1">
              <div className="text-lg font-bold text-alaska-teal">+10,000</div>
              <div className="text-xs text-slate-500">Anniversary</div>
            </div>
          )}
          {(amount || isAnniversary) && (
            <div className="text-center flex-1 border-l border-slate-200 pl-3">
              <div className="text-lg font-bold text-slate-800">+{totalPoints.toLocaleString()}</div>
              <div className="text-xs text-slate-500">Total SP</div>
            </div>
          )}
        </div>
        {!amount && !isAnniversary && (
          <p className="text-center text-xs text-slate-400">Enter an amount to see points</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!amount && !isAnniversary}
          className="flex-1 bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          Add
        </button>
      </div>
    </form>
  )
}
