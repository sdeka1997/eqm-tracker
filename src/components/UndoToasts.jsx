// The "Deleted X · Undo" toasts for a useUndoDelete queue.
export default function UndoToasts({ queue, onUndo }) {
  return queue.map(u => (
    <div key={u.id} className="flex items-center justify-between bg-slate-800 text-white px-4 py-3 rounded-xl text-sm mb-2">
      <span className="text-slate-300">Deleted <span className="font-medium text-white">{u.label}</span></span>
      <button onClick={() => onUndo(u.id)} className="ml-4 font-semibold text-alaska-teal shrink-0">Undo</button>
    </div>
  ))
}
