import { CURRENT_YEAR } from '../utils/calculations'
import { buildDemoActivities } from './demoData'

// In-memory stand-in for Firestore while in demo mode. Nothing leaves the
// browser, and a page reload starts from fresh sample data.

export const DEMO_UID = 'demo'

export const DEMO_USER = {
  uid: DEMO_UID,
  displayName: 'Demo Traveler',
  email: 'demo mode',
  photoURL: null,
  isDemo: true,
}

export const isDemoUid = (uid) => uid === DEMO_UID

let nextId = 1
const newId = () => `demo-${nextId++}`

let state = null
const listeners = new Set()

function ensureSeeded() {
  if (state) return
  state = {
    activities: buildDemoActivities(CURRENT_YEAR).map(a => ({
      ...a,
      id: newId(),
      year: parseInt(a.date.slice(0, 4)),
    })),
    // Empty until the simulated Gmail scan finds something.
    pending: [],
  }
}

function emit() {
  listeners.forEach(fn => fn(state))
}

export function subscribeDemo(fn) {
  ensureSeeded()
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

export function resetDemo() {
  state = null
}

function mutate(collection, fn) {
  ensureSeeded()
  state = { ...state, [collection]: fn(state[collection]) }
  emit()
}

export const demoDb = {
  add(collection, data) {
    mutate(collection, docs => [...docs, { ...data, id: newId() }])
  },
  update(collection, id, data) {
    mutate(collection, docs => docs.map(d => (d.id === id ? { ...d, ...data } : d)))
  },
  remove(collection, id) {
    mutate(collection, docs => docs.filter(d => d.id !== id))
  },
}
