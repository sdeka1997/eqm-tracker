import { useState } from 'react'
import { getToday } from '../utils/calculations'
import { useUndoDelete } from '../hooks/useUndoDelete'
import UndoToasts from './UndoToasts'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
import { useEscapeClose } from '../hooks/useEscapeClose'

const INPUT = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alaska-blue'

// Add and edit share one screen; adding passes no item and no onDelete.
function MiscEditModal({ item = {}, onSave, onDelete, onClose }) {
  const [description, setDescription] = useState(item.description || '')
  const [points, setPoints] = useState(String(item.statusPoints ?? ''))
  const [date, setDate] = useState(item.date || getToday())
  useEscapeClose(onClose)

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
      <div className="p-5 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">{item.id ? 'Miscellaneous' : 'Add Miscellaneous'}</h3>
      </div>
      <div className="p-5 space-y-3">
        <input className={INPUT} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (e.g. Lyft ride credit)" autoFocus={!item.id} />
        <div className="grid grid-cols-2 gap-3">
          <input className={INPUT} type="number" min="0" value={points} onChange={e => setPoints(e.target.value)} placeholder="SP" />
          <input className={INPUT} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <ModalFooter
        onDelete={onDelete}
        onCancel={onClose}
        onSave={() => onSave({ description: description.trim(), statusPoints: parseInt(points) || 0, date })}
        saveDisabled={!description.trim() || !(parseInt(points) > 0) || !date}
      />
    </Modal>
  )
}

export default function MiscSection({ activities, onAdd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const { requestDelete, undo, queue: undoQueue, pendingIds } = useUndoDelete(onDelete)
  const miscItems = activities.filter(a => a.type === 'misc' && !pendingIds.has(a.id))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-800">Miscellaneous</h2>
          <button onClick={() => setAdding(true)} className="text-xs text-alaska-blue hover:underline font-medium">+ Add</button>
        </div>
      </div>

      <UndoToasts queue={undoQueue} onUndo={undo} />

      {miscItems.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">No entries yet — click + Add to get started</p>
      )}

      {miscItems.length > 0 && (
        <div className="space-y-1">
          {miscItems.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(a => (
            <div key={a.id} onClick={() => setEditing(a)} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <span className="text-base">🎁</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">{a.description}</div>
                <div className="text-xs text-slate-400">{a.date}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-alaska-blue">+{(a.statusPoints || 0).toLocaleString()} SP</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <MiscEditModal
          onSave={async data => { await onAdd({ type: 'misc', ...data }); setAdding(false) }}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <MiscEditModal
          item={editing}
          onSave={async data => { await onUpdate(editing.id, data); setEditing(null) }}
          onDelete={() => { requestDelete(editing.id, editing.description || 'Entry'); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
