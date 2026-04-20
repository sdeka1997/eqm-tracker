import { useState, useEffect } from 'react'
import {
  collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot,
  query, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { calculateCardSpendPoints, isCardItem, getToday } from '../utils/calculations'

export function useActivities(uid, year) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!uid) return
    setLoading(true)
    setError(null)
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

  async function addActivity(data) {
    await addDoc(collection(db, 'users', uid, 'activities'), {
      year, // default to current view year; data.year overrides if present
      ...data,
      createdAt: serverTimestamp(),
    })
  }

  async function removeActivity(id) {
    await deleteDoc(doc(db, 'users', uid, 'activities', id))
  }

  async function updateActivity(id, data) {
    await updateDoc(doc(db, 'users', uid, 'activities', id), data)
  }

  const today = getToday()

  function calcPoints(acts) {
    const nonCard = acts
      .filter(a => !isCardItem(a))
      .reduce((sum, a) => sum + (a.statusPoints || 0), 0)
    return nonCard + calculateCardSpendPoints(acts)
  }

  const earnedPoints = calcPoints(activities.filter(a => (a.date || '') <= today))
  const plannedPoints = calcPoints(activities.filter(a => (a.date || '') > today))
  const totalPoints = earnedPoints + plannedPoints

  return { activities, loading, error, earnedPoints, plannedPoints, totalPoints, addActivity, removeActivity, updateActivity }
}
