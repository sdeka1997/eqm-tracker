import { useState } from 'react'
import { formatMonth, groupByMonth, calculateCardSpendPoints, isCardItem } from '../utils/calculations'
import Modal from './Modal'
import { useEscapeClose } from '../hooks/useEscapeClose'

function EditDateModal({ activity, onSave, onClose }) {
  const [date, setDate] = useState(activity.date || '')
  useEscapeClose(onClose)

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Edit Posting Date</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{activity.notes || 'Card Spend'}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Posting date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alaska-blue"
              autoFocus
            />
          </div>
          {date !== activity.date && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Moving from {activity.date} → {date}
              {activity.date?.slice(0, 7) !== date.slice(0, 7) && ' (different month — SP will be recalculated)'}
            </p>
          )}
        </div>
        <div className="flex border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm text-slate-500 hover:bg-slate-50 rounded-bl-2xl transition-colors font-medium"
          >
            Cancel
          </button>
          <div className="w-px bg-slate-100" />
          <button
            onClick={() => onSave(date)}
            disabled={!date}
            className="flex-1 py-3 text-sm text-alaska-blue hover:bg-alaska-blue hover:text-white rounded-br-2xl transition-colors font-semibold disabled:opacity-40"
          >
            Save
          </button>
        </div>
    </Modal>
  )
}

export default function CardSpendSection({ activities, onDelete, onUpdate, onDeleteAll, onAddManual, onSync, cardConnected }) {
  const [expanded, setExpanded] = useState(null)
  const [editingActivity, setEditingActivity] = useState(null)

  const cardItems = activities.filter(a => isCardItem(a))

  const byMonth = groupByMonth(cardItems)
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))
  const totalSP = calculateCardSpendPoints(cardItems)

  async function handleSaveDate(newDate) {
    if (newDate && newDate !== editingActivity.date) {
      await onUpdate(editingActivity.id, { date: newDate })
    }
    setEditingActivity(null)
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-800">Card Spend</h2>
              <button onClick={onAddManual} className="text-xs text-alaska-blue hover:underline font-medium">+ Add</button>
            </div>
            {onSync && (cardItems.length > 0 || cardConnected) && (
              <button
                onClick={onSync}
                className="text-xs border border-slate-200 text-slate-500 hover:border-alaska-teal hover:text-alaska-teal px-2.5 py-0.5 rounded-full transition-colors"
              >
                💳 Sync
              </button>
            )}
          </div>
          {/* delete-all card button hidden but kept for re-enable
          <div className="flex items-center justify-end mt-1">
            <button
              onClick={onDeleteAll}
              className="text-slate-300 hover:text-red-400 text-lg leading-none transition-colors"
              title="Delete all card transactions"
            >
              ×
            </button>
          </div>
          */}
        </div>

        {cardItems.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-slate-400">No transactions yet</p>
            {onSync && !cardConnected && (
              <button
                onClick={onSync}
                className="bg-alaska-teal hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Set up card sync
              </button>
            )}
          </div>
        ) : (
        <div className="space-y-2">
          {months.map(month => {
            const items = byMonth[month]
            const monthSpend = items.filter(a => a.type === 'card_spend').reduce((sum, a) => sum + (a.amount || 0), 0)
            const bonusSP = items.filter(a => a.type === 'anniversary_bonus').reduce((sum, a) => sum + (a.statusPoints || 0), 0)
            const monthSP = Math.round(monthSpend / 2) + bonusSP
            const hasBonus = items.some(a => a.type === 'anniversary_bonus')
            const currentMonth = new Date().toISOString().slice(0, 7)
            const isOpen = expanded !== null ? expanded === month : month === currentMonth

            return (
              <div key={month} className="border border-slate-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : month)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800">{formatMonth(month)}</span>
                    {monthSpend > 0 && (
                      <span className="text-xs text-slate-400">
                        ${monthSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-alaska-blue">{monthSP > 0 ? '+' : ''}{monthSP.toLocaleString()} SP</span>
                    <span className="text-slate-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {items.map(a => (
                      <div
                        key={a.id}
                        onClick={() => a.type === 'card_spend' && setEditingActivity(a)}
                        className={`flex items-center gap-3 px-4 py-2.5 group hover:bg-slate-50 ${a.type === 'card_spend' ? 'cursor-pointer' : ''}`}
                      >
                        <span className="text-base">{a.type === 'anniversary_bonus' ? '🎉' : '💳'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">
                            {a.type === 'anniversary_bonus' ? 'Anniversary Bonus' : a.notes || 'Card Spend'}
                          </div>
                          <div className="text-xs text-slate-400">{a.date}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            {a.amount != null && a.amount !== 0 && (
                              <div className={`text-xs font-medium px-1.5 py-0.5 rounded ${a.amount < 0 ? 'text-green-700 bg-green-50' : 'text-red-400 bg-red-50'}`}>
                                {a.amount < 0 ? '+' : '-'}${Math.abs(a.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                            {a.type === 'anniversary_bonus' && (
                              <div className="text-xs font-bold text-alaska-blue">+{(a.statusPoints || 0).toLocaleString()} SP</div>
                            )}
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); onDelete(a.id) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 text-lg leading-none"
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}
      </div>

      {editingActivity && (
        <EditDateModal
          activity={editingActivity}
          onSave={handleSaveDate}
          onClose={() => setEditingActivity(null)}
        />
      )}
    </>
  )
}
