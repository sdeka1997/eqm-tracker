import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'

// Identity of a queued Gmail flight. Keyed per segment, not per booking: a
// multi-leg itinerary shares one PNR and each leg needs its own queue entry.
function gmailDedupeKey(d) {
  if (d.confirmationNumber) {
    return `pnr:${d.confirmationNumber}|${d.origin || ''}|${d.destination || ''}|${d.date || ''}`
  }
  if (d.flightNumber && d.date) return `fk:${d.flightNumber}|${d.date}`
  return null
}

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
        // Retire only the keys whose writes have now landed. Clearing wholesale
        // let a write retire its own guard — Firestore echoes a local mutation
        // back before addDoc resolves — so the next leg of the same booking was
        // checked against an empty set and against a stale `pending` closure.
        const landed = new Set(docs.map(gmailDedupeKey).filter(Boolean))
        inflightKeys.current.forEach(k => { if (landed.has(k)) inflightKeys.current.delete(k) })
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
    // Deduplicate Gmail imports by PNR+segment (primary) then flightNumber+date (fallback)
    if (data.importedFrom === 'gmail_sync') {
      const dedupeKey = gmailDedupeKey(data)
      if (dedupeKey) {
        // The confirmed-activity check stays booking-level: if any leg of this PNR is
        // already confirmed, the segment-subset check in gmailSync has already decided
        // whether the itinerary genuinely changed.
        const inConfirmed = data.confirmationNumber
          ? existingPNRs?.has(data.confirmationNumber)
          : existingFlightKeys?.has(`${data.flightNumber}|${data.date}`)
        const inPending = pending.some(p => gmailDedupeKey(p) === dedupeKey)
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
