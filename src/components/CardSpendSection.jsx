import { useState } from 'react'
import { formatMonth, groupByMonth, calculateCardSpendPoints, isProjectionOverdue, getToday, isCardItem, projectionSnapshot, rankChargeSuggestions } from '../utils/calculations'
import MatchPicker, { dayGapLabel, FlagNote } from './MatchPicker'
import Modal from './Modal'
import { useEscapeClose } from '../hooks/useEscapeClose'
import ModalFooter from './ModalFooter'
import { useUndoDelete } from '../hooks/useUndoDelete'
import UndoToasts from './UndoToasts'

function EditDateModal({ activity, onSave, onUnmatch, onDelete, onClose }) {
  const isBonus = activity.type === 'anniversary_bonus'
  const [date, setDate] = useState(activity.date || '')
  useEscapeClose(onClose)

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{isBonus ? 'Anniversary Bonus' : 'Edit Posting Date'}</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{isBonus ? `+${(activity.statusPoints || 0).toLocaleString()} SP` : activity.notes || 'Card Spend'}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">{isBonus ? 'Date' : 'Posting date'}</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alaska-blue"
              autoFocus
            />
          </div>
          {activity.plannedAs && (
            <div className="flex items-center justify-between gap-3 text-xs bg-green-50 rounded-lg px-3 py-2">
              <span className="text-green-700 min-w-0">
                ✓ Matched to <span className="font-medium">{activity.plannedAs.notes || 'projected spend'}</span>
                <span className="text-green-600/70"> · ${(activity.plannedAs.amount || 0).toLocaleString()} · {activity.plannedAs.date}</span>
              </span>
              <button onClick={onUnmatch} className="shrink-0 text-alaska-blue hover:underline font-medium">Unmatch</button>
            </div>
          )}
          {date !== activity.date && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Moving from {activity.date} → {date}
              {activity.date?.slice(0, 7) !== date.slice(0, 7) && ' (different month — SP will be recalculated)'}
            </p>
          )}
        </div>
        <ModalFooter onDelete={onDelete} onCancel={onClose} onSave={() => onSave(date)} saveDisabled={!date} />
    </Modal>
  )
}

function ProjectionModal({ projection, transactions, onSave, onMatch, onDelete, onClose }) {
  const [notes, setNotes] = useState(projection.notes || '')
  const [amount, setAmount] = useState(String(projection.amount ?? ''))
  const [date, setDate] = useState(projection.date || '')
  useEscapeClose(onClose)

  // Suggestions follow the amount and date being edited, so fixing either re-ranks the list.
  const target = parseFloat(amount) || 0
  const suggestions = rankChargeSuggestions({ amount: target, date }, transactions)
  const searchPool = [...transactions].sort((a, b) => b.date.localeCompare(a.date))
  const money = n => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  function describe(t) {
    const diff = (t.amount || 0) - target
    const amountPart = Math.abs(diff) < 0.005 ? 'same amount' : `${diff > 0 ? '+' : '−'}$${Math.abs(diff).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return {
      title: t.notes || 'Card spend',
      subtitle: [t.date, amountPart, dayGapLabel(t.date, date)].filter(Boolean).join(' · '),
      right: money(t.amount),
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alaska-blue'

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
      <div className="p-5 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">Projected purchase</h3>
        <p className="text-xs text-slate-400 mt-0.5">Counts as planned until you match it to the real charge. If it is still unmatched a week after its date, it stops counting.</p>
      </div>
      <div className="p-5 space-y-3">
        <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What is it?" />
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          <input className={inputCls} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {isProjectionOverdue(projection) && (
          <FlagNote>More than a week past its date with no matching charge.</FlagNote>
        )}
        <MatchPicker
          label="Already posted? Pick the real charge:"
          suggestions={suggestions}
          searchPool={searchPool}
          searchText={t => `${t.notes || ''} ${(t.amount || 0).toFixed(2)}`}
          describe={describe}
          onMatch={onMatch}
          emptyText="No charges within two weeks of this date. Try searching."
        />
      </div>
      <ModalFooter
        onDelete={onDelete}
        onCancel={onClose}
        onSave={() => onSave({ notes: notes.trim(), amount: parseFloat(amount) || 0, date })}
        saveDisabled={!(parseFloat(amount) > 0) || !date}
      />
    </Modal>
  )
}

export default function CardSpendSection({ activities, onAdd, onDelete, onUpdate, onAddManual, onSync, cardConnected }) {
  const [expanded, setExpanded] = useState(null)
  const [editingActivity, setEditingActivity] = useState(null)

  const { requestDelete, undo, queue: undoQueue, pendingIds } = useUndoDelete(onDelete)
  const deleteItem = a => requestDelete(a.id, a.type === 'anniversary_bonus' ? 'Anniversary bonus' : a.notes || 'Card spend')

  const cardItems = activities.filter(a => isCardItem(a) && !pendingIds.has(a.id))

  const byMonth = groupByMonth(cardItems)
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))
  const totalSP = calculateCardSpendPoints(cardItems)
  const [editingProjection, setEditingProjection] = useState(null)
  const today = getToday()

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
        </div>

        <UndoToasts queue={undoQueue} onUndo={undo} />

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
            const items = [...byMonth[month]].sort((a, b) => (b.type === 'card_projection') - (a.type === 'card_projection'))
            // Planned purchases count in the month's totals like future flights do;
            // the Projected tag on each row is where the distinction lives.
            const overdueCount = items.filter(a => a.type === 'card_projection' && isProjectionOverdue(a, today)).length
            const monthSpend = items.filter(a => a.type === 'card_spend' || (a.type === 'card_projection' && !isProjectionOverdue(a, today))).reduce((sum, a) => sum + (a.amount || 0), 0)
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
                    {overdueCount > 0 && (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{overdueCount} overdue</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-alaska-blue">{monthSP > 0 ? '+' : ''}{monthSP.toLocaleString()} SP</span>
                    <span className="text-slate-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {items.map(a => a.type === 'card_projection' ? (
                      <div
                        key={a.id}
                        onClick={() => setEditingProjection(a)}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isProjectionOverdue(a, today) ? 'bg-slate-100/70 hover:bg-slate-100' : 'hover:bg-slate-50'}`}
                      >
                        <span className="text-base opacity-50">🗓️</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-slate-600 truncate">{a.notes || 'Projected spend'}</span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {a.date}
                            {isProjectionOverdue(a, today) && <span className="text-amber-600"> · Overdue</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`text-xs font-medium border border-dashed rounded px-1.5 py-0.5 ${isProjectionOverdue(a, today) ? 'text-slate-300 border-slate-200 line-through' : 'text-slate-500 border-slate-300'}`}>
                            -${(a.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={a.id}
                        onClick={() => setEditingActivity(a)}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50"
                      >
                        <span className="text-base">{a.type === 'anniversary_bonus' ? '🎉' : '💳'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">
                            {a.type === 'anniversary_bonus' ? 'Anniversary Bonus' : a.notes || 'Card Spend'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {a.date}
                            {a.plannedAs && <span className="ml-1.5 text-green-600" title={`Matched to ${a.plannedAs.notes || 'projected spend'}`}>✓</span>}
                          </div>
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

      {editingProjection && (
        <ProjectionModal
          projection={editingProjection}
          transactions={cardItems.filter(a => a.type === 'card_spend' && !a.plannedAs)}
          onSave={async data => { await onUpdate(editingProjection.id, data); setEditingProjection(null) }}
          onDelete={() => { deleteItem(editingProjection); setEditingProjection(null) }}
          onMatch={async tx => {
            const p = editingProjection
            await onUpdate(tx.id, { plannedAs: projectionSnapshot(p) })
            await onDelete(p.id)
            setEditingProjection(null)
          }}
          onClose={() => setEditingProjection(null)}
        />
      )}

      {editingActivity && (
        <EditDateModal
          activity={editingActivity}
          onSave={handleSaveDate}
          onDelete={() => { deleteItem(editingActivity); setEditingActivity(null) }}
          onUnmatch={async () => {
            // Put the planned purchase back exactly as it was, then clear the link.
            const { plannedAs } = editingActivity
            await onAdd(plannedAs)
            await onUpdate(editingActivity.id, { plannedAs: null })
            setEditingActivity(null)
          }}
          onClose={() => setEditingActivity(null)}
        />
      )}
    </>
  )
}
