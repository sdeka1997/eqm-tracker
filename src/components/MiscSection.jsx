import { useState } from 'react'

export default function MiscSection({ activities, onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const miscItems = activities.filter(a => a.type === 'misc')
  const totalSP = miscItems.reduce((sum, a) => sum + (a.statusPoints || 0), 0)

  async function handleAdd() {
    if (!points || !description) return
    await onAdd({
      type: 'misc',
      description,
      statusPoints: parseInt(points),
      date,
    })
    setDescription('')
    setPoints('')
    setDate(new Date().toISOString().slice(0, 10))
    setShowForm(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-800">Miscellaneous</h2>
          <button
            onClick={() => setShowForm(s => !s)}
            className="text-xs text-alaska-blue hover:underline font-medium"
          >
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {/* delete-all misc button hidden but kept for re-enable
        <div className="flex items-center gap-2">
          {miscItems.length > 0 && (
            <button
              onClick={() => miscItems.forEach(a => onDelete(a.id))}
              className="text-slate-300 hover:text-red-400 text-lg leading-none transition-colors"
              title="Delete all"
            >
              ×
            </button>
          )}
        </div>
        */}
      </div>

      {showForm && (
        <div className="bg-slate-50 rounded-xl p-3 space-y-2 mb-3">
          <input
            type="text"
            placeholder="Description (e.g. Lyft ride credit)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-alaska-blue bg-white"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="SP amount"
              min="1"
              value={points}
              onChange={e => setPoints(e.target.value)}
              className="flex-1 text-xs rounded-lg border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-alaska-blue bg-white"
            />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="flex-1 text-xs rounded-lg border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-alaska-blue bg-white"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!description || !points}
            className="w-full bg-alaska-blue text-white py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-alaska-navy transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {miscItems.length === 0 && !showForm && (
        <p className="text-sm text-slate-400 text-center py-4">No entries yet — click + Add to get started</p>
      )}

      {miscItems.length > 0 && (
        <div className="space-y-1">
          {miscItems.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(a => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 group transition-colors">
              <span className="text-base">🎁</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">{a.description}</div>
                <div className="text-xs text-slate-400">{a.date}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-alaska-blue">+{(a.statusPoints || 0).toLocaleString()} SP</span>
                <button
                  onClick={() => onDelete(a.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 text-lg leading-none"
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
}
