import { useState, useEffect } from 'react'
import {
  collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot,
  query, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { isDemoUid, subscribeDemo, demoDb } from '../demo/demoStore'
import { calculateCardSpendPoints, calculateCardProjectionPoints, countsTowardStatus, isCardItem, getToday } from '../utils/calculations'

export function useActivities(uid, year) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!uid) return
    setLoading(true)
    setError(null)
    if (isDemoUid(uid)) {
      return subscribeDemo(state => {
        const docs = state.activities.filter(a => a.year === year)
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setActivities(docs)
        setLoading(false)
      })
    }
    // NOTE: this query (where + orderBy on different fields) requires a
    // Firestore composite index. Firestore will log a link to create it
    // on first run — click that link in the browser console.
    const q = query(
      collection(db, 'users', uid, 'activities'),
      where('year', '==', year),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        // Sort client-side — avoids needing a Firestore composite index
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setActivities(docs)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('Firestore error:', err)
        setLoading(false)
        setError(err.message)
      },
    )
    return unsub
  }, [uid, year])

  // An entry belongs to the status year of its own date, not the year being
  // viewed — otherwise a Dec 2025 entry added from the 2026 tab counts for 2026.
  function yearOf(data) {
    return data.date ? { year: parseInt(data.date.slice(0, 4)) } : {}
  }

  async function addActivity(data) {
    if (isDemoUid(uid)) return demoDb.add('activities', { year, ...data, ...yearOf(data) })
    await addDoc(collection(db, 'users', uid, 'activities'), {
      year, // fallback for entries without a date
      ...data,
      ...yearOf(data),
      createdAt: serverTimestamp(),
    })
  }

  async function removeActivity(id) {
    if (isDemoUid(uid)) return demoDb.remove('activities', id)
    await deleteDoc(doc(db, 'users', uid, 'activities', id))
  }

  async function updateActivity(id, data) {
    if (isDemoUid(uid)) return demoDb.update('activities', id, { ...data, ...yearOf(data) })
    await updateDoc(doc(db, 'users', uid, 'activities', id), { ...data, ...yearOf(data) })
  }

  const today = getToday()

  function calcPoints(acts) {
    const nonCard = acts
      .filter(a => !isCardItem(a) && countsTowardStatus(a, today))
      .reduce((sum, a) => sum + (a.statusPoints || 0), 0)
    return nonCard + calculateCardSpendPoints(acts)
  }

  const earnedPoints = calcPoints(activities.filter(a => (a.date || '') <= today))
  const plannedPoints = calcPoints(activities.filter(a => (a.date || '') > today))
    + calculateCardProjectionPoints(activities)
  const totalPoints = earnedPoints + plannedPoints

  return { activities, loading, error, earnedPoints, plannedPoints, totalPoints, addActivity, removeActivity, updateActivity }
}
