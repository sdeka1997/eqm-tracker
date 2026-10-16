import { useState } from 'react'

// Deletes after a short delay so an Undo toast can cancel it. Items waiting to
// be deleted are in pendingIds; callers hide them so the delete feels instant.
export function useUndoDelete(onDelete, delayMs = 4000) {
  const [queue, setQueue] = useState([]) // [{ id, label, timeoutId }]

  function requestDelete(id, label) {
    const timeoutId = setTimeout(() => {
      onDelete(id)
      setQueue(q => q.filter(u => u.id !== id))
    }, delayMs)
    setQueue(q => [...q, { id, label, timeoutId }])
  }

  function undo(id) {
    const entry = queue.find(u => u.id === id)
    if (entry) clearTimeout(entry.timeoutId)
    setQueue(q => q.filter(u => u.id !== id))
  }

  const pendingIds = new Set(queue.map(u => u.id))
  return { requestDelete, undo, queue, pendingIds }
}
