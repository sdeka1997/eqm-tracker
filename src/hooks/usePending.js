import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'

export function usePending(uid) {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const inflightKeys = useRef(new Set()) // tracks writes in-progress before onSnapshot fires

  useEffect(() => {
    if (!uid) return
    const q = query(collection(db, 'users', uid, 'pending'))
    const unsub = onSnapshot(
      q,
      snap => {
        const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }))
        docs.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        setPending(docs)
        setLoading(false)
        inflightKeys.current.clear()
      },
      err => {
        console.error('Pending queue error:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [uid])

  async function addPending(data, { existingFlightyIds, existingFlightKeys, existingPNRs } = {}) {
    // Deduplicate Flighty imports by flightyId
    if (data.flightyId) {
      const inPending = pending.some(p => p.flightyId === data.flightyId)
      const inConfirmed = existingFlightyIds?.has(data.flightyId)
      if (inPending || inConfirmed) return false
    }
    // Deduplicate Gmail imports by PNR (primary) then flightNumber+date (fallback)
    if (data.importedFrom === 'gmail_sync') {
      if (data.confirmationNumber) {
        const dedupeKey = `pnr:${data.confirmationNumber}`
        const inPending = pending.some(p => p.confirmationNumber === data.confirmationNumber)
        const inConfirmed = existingPNRs?.has(data.confirmationNumber)
        if (inPending || inConfirmed || inflightKeys.current.has(dedupeKey)) return false
        inflightKeys.current.add(dedupeKey)
        await addDoc(collection(db, 'users', uid, 'pending'), { ...data, addedAt: serverTimestamp() })
        return true
      } else if (data.flightNumber && data.date) {
        const dedupeKey = `fk:${data.flightNumber}|${data.date}`
        const key = `${data.flightNumber}|${data.date}`
        const inPending = pending.some(p => p.flightNumber && p.date && `${p.flightNumber}|${p.date}` === key)
        const inConfirmed = existingFlightKeys?.has(key)
        if (inPending || inConfirmed || inflightKeys.current.has(dedupeKey)) return false
        inflightKeys.current.add(dedupeKey)
        await addDoc(collection(db, 'users', uid, 'pending'), { ...data, addedAt: serverTimestamp() })
        return true
      }
    }
    await addDoc(collection(db, 'users', uid, 'pending'), {
      ...data,
      addedAt: serverTimestamp(),
    })
    return true
  }

  async function updatePending(id, updates) {
    await setDoc(doc(db, 'users', uid, 'pending', id), updates, { merge: true })
  }

  async function dismissPending(id) {
    await deleteDoc(doc(db, 'users', uid, 'pending', id))
  }

  async function clearAllPending() {
    const batch = writeBatch(db)
    pending.forEach(p => batch.delete(doc(db, 'users', uid, 'pending', p.id)))
    await batch.commit()
  }

  return { pending, loading, addPending, updatePending, dismissPending, clearAllPending }
}
