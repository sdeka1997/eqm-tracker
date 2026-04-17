import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, getDocs, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useActivities } from '../hooks/useActivities'
import TierProgress from './TierProgress'
import FlightSetupModal from './FlightSetupModal'
import ActivityLog from './ActivityLog'
import FlightForm from './FlightForm'
import CardSpendForm from './CardSpendForm'
import GmailSync from './GmailSync'
import FlightyImport from './FlightyImport'
import TellerSync from './TellerSync'
import CardSpendSection from './CardSpendSection'
import MiscSection from './MiscSection'
import ReviewQueue from './ReviewQueue'
import { usePending } from '../hooks/usePending'
import { getCurrentTier, getNextTier, EARNING_METHODS, CURRENT_YEAR } from '../utils/calculations'

const EARNING_METHOD_KEY = 'atmos_earning_method'

export default function Dashboard({ user, calendarToken, onSignOut, onRefreshGmailToken }) {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [modal, setModal] = useState(null) // null | 'flight' | 'card' | 'calendar' | 'teller' | 'flighty'
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(null) // null | 'flights' | 'card'
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const profileMenuRef = useRef(null)
  const [earningMethod, setEarningMethod] = useState(
    () => localStorage.getItem(EARNING_METHOD_KEY) || 'distance'
  )
  const { activities, loading, error, earnedPoints, plannedPoints, totalPoints, addActivity, removeActivity, updateActivity } = useActivities(user.uid, year)
  const { pending, addPending, dismissPending, clearAllPending } = usePending(user.uid)

  const [lastPoll, setLastPoll] = useState(null)
  useEffect(() => {
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) setLastPoll(snap.data().gmailLastPoll || null)
    })
  }, [user.uid])

  async function handlePollComplete(isoString) {
    setLastPoll(isoString)
    await setDoc(doc(db, 'users', user.uid), { gmailLastPoll: isoString }, { merge: true })
  }

  useEffect(() => {
    if (!showProfileMenu) return
    function handleClick(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showProfileMenu])

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    try {
      async function deleteCollection(path) {
        const snap = await getDocs(collection(db, path))
        if (snap.empty) return
        const batch = writeBatch(db)
        snap.docs.forEach(d => batch.delete(d.ref))
        await batch.commit()
      }
      await deleteCollection(`users/${user.uid}/activities`)
      await deleteCollection(`users/${user.uid}/pending`)
      await deleteDoc(doc(db, 'users', user.uid))
      localStorage.clear()
      onSignOut()
    } finally {
      setDeletingAccount(false)
    }
  }

  // Track all imported Teller IDs across all years for deduplication
  const [allTellerIds, setAllTellerIds] = useState(new Set())
  useEffect(() => {
    const q = query(
      collection(db, 'users', user.uid, 'activities'),
      where('source', '==', 'teller'),
    )
    return onSnapshot(q, snap => {
      setAllTellerIds(new Set(snap.docs.map(d => d.data().tellerTxId).filter(Boolean)))
    })
  }, [user.uid])

  // Track all imported Flighty IDs across all years for deduplication
  const [allFlightyIds, setAllFlightyIds] = useState(new Set())
  useEffect(() => {
    const q = query(
      collection(db, 'users', user.uid, 'activities'),
      where('importedFrom', '==', 'flighty_csv'),
    )
    return onSnapshot(q, snap => {
      setAllFlightyIds(new Set(snap.docs.map(d => d.data().flightyId).filter(Boolean)))
    })
  }, [user.uid])

  // Track all confirmed Gmail activities for deduplication
  const [allGmailFlightKeys, setAllGmailFlightKeys] = useState(new Set())
  useEffect(() => {
    const q = query(
      collection(db, 'users', user.uid, 'activities'),
      where('importedFrom', '==', 'gmail_sync'),
    )
    return onSnapshot(q, snap => {
      setAllGmailFlightKeys(new Set(
        snap.docs.map(d => d.data()).filter(d => d.flightNumber && d.date).map(d => `${d.flightNumber}|${d.date}`)
      ))
    })
  }, [user.uid])

  // Track all confirmed activities by PNR across all years and sources
  const [allActivitiesByPNR, setAllActivitiesByPNR] = useState(new Map())
  useEffect(() => {
    return onSnapshot(collection(db, 'users', user.uid, 'activities'), snap => {
      const byPNR = new Map()
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.confirmationNumber) byPNR.set(data.confirmationNumber, { ...data, id: d.id })
      })
      setAllActivitiesByPNR(byPNR)
    })
  }, [user.uid])

  const currentTier = getCurrentTier(earnedPoints)

  useEffect(() => {
    if (!modal) return
    const handler = (e) => { if (e.key === 'Escape') setModal(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modal])

  function handleEarningMethodChange(method) {
    setEarningMethod(method)
    localStorage.setItem(EARNING_METHOD_KEY, method)
  }


  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-alaska-navy text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">✈️</span>
            <div>
              <h1 className="font-bold text-lg leading-tight">Atmos Tracker</h1>
              <p className="text-xs text-blue-200 leading-tight">Alaska Airlines Status Points</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              className="bg-white/10 border border-white/20 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none"
            >
              {[CURRENT_YEAR, CURRENT_YEAR - 1].map(y => (
                <option key={y} value={y} className="text-slate-800 bg-white">{y}</option>
              ))}
            </select>
            <div className="relative" ref={profileMenuRef}>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full border-2 border-white/30 cursor-pointer"
                  onClick={() => setShowProfileMenu(s => !s)}
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div
                className="w-8 h-8 rounded-full border-2 border-white/30 cursor-pointer bg-white/20 items-center justify-center text-sm font-bold text-white"
                style={{ display: user.photoURL ? 'none' : 'flex' }}
                onClick={() => setShowProfileMenu(s => !s)}
              >
                {user.displayName?.[0]?.toUpperCase() || '?'}
              </div>
              {showProfileMenu && (
                <div className="absolute right-0 top-10 bg-white rounded-xl shadow-lg border border-slate-100 py-1 w-44 z-50">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <div className="text-xs font-medium text-slate-700 truncate">{user.displayName}</div>
                    <div className="text-xs text-slate-400 truncate">{user.email}</div>
                  </div>
                  <button
                    onClick={() => { setShowProfileMenu(false); onSignOut() }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Sign out
                  </button>
                  <button
                    onClick={() => { setShowProfileMenu(false); setConfirmDeleteAccount(true) }}
                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Delete account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="lg:grid lg:grid-cols-5 lg:gap-6 flex flex-col gap-6">

          {/* ── Left column (3/5) ── */}
          <div className="lg:col-span-3 flex flex-col gap-6">

            {/* Status summary + tier progress */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-4xl font-black text-alaska-navy">{earnedPoints.toLocaleString()}</div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    Status Points earned in {year}
                    {plannedPoints > 0 && (
                      <span className="ml-1 text-slate-400">· {totalPoints.toLocaleString()} with planned</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {currentTier ? (
                    <div>
                      <div className="font-bold text-slate-800">{currentTier.name}</div>
                      <div className="text-xs text-slate-500">Current tier</div>
                    </div>
                  ) : (
                    <div className="font-medium text-slate-400 text-sm">No tier yet</div>
                  )}
                </div>
              </div>
              <TierProgress earnedPoints={earnedPoints} plannedPoints={plannedPoints} />
              {(() => {
                const today = new Date().toISOString().slice(0, 10)

                const flightEarned = activities.filter(a => (a.type === 'flight' || !a.type) && (a.date || '') <= today).reduce((s, a) => s + (a.statusPoints || 0), 0)
                const flightPlanned = activities.filter(a => (a.type === 'flight' || !a.type) && (a.date || '') > today).reduce((s, a) => s + (a.statusPoints || 0), 0)

                const cardSP = (acts) => {
                  const byMonth = {}
                  acts.filter(a => a.type === 'card_spend').forEach(a => {
                    const m = (a.date || '').slice(0, 7)
                    byMonth[m] = (byMonth[m] || 0) + (a.amount || 0)
                  })
                  return Object.values(byMonth).reduce((s, m) => s + Math.round(m / 2), 0)
                    + acts.filter(a => a.type === 'anniversary_bonus').reduce((s, a) => s + (a.statusPoints || 0), 0)
                }
                const cardEarned = cardSP(activities.filter(a => (a.date || '') <= today))
                const cardPlanned = cardSP(activities.filter(a => (a.date || '') > today))

                const miscEarned = activities.filter(a => a.type === 'misc' && (a.date || '') <= today).reduce((s, a) => s + (a.statusPoints || 0), 0)
                const miscPlanned = activities.filter(a => a.type === 'misc' && (a.date || '') > today).reduce((s, a) => s + (a.statusPoints || 0), 0)

                const rows = [
                  { label: 'Flights', earned: flightEarned, planned: flightPlanned },
                  { label: 'Card Spend', earned: cardEarned, planned: cardPlanned },
                  { label: 'Miscellaneous', earned: miscEarned, planned: miscPlanned },
                ].filter(r => r.earned > 0 || r.planned > 0)

                if (rows.length === 0) return null
                return (
                  <div className="border-t border-slate-100 pt-3 space-y-1.5">
                    {rows.map(r => (
                      <div key={r.label} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{r.label}</span>
                        <span className="text-slate-600">
                          +{r.earned.toLocaleString()} SP
                          {r.planned > 0 && <span className="text-slate-400 ml-1">· +{r.planned.toLocaleString()} planned</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>


            {/* Flights */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-800">Flights</h2>
                    <button onClick={() => setModal('flight')} className="text-xs text-alaska-blue hover:underline font-medium">+ Add</button>
                  </div>
                  {year >= 2026 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setModal('flighty')}
                        className="text-xs border border-slate-200 text-slate-500 hover:border-alaska-teal hover:text-alaska-teal px-2.5 py-0.5 rounded-full transition-colors"
                      >
                        ✈ Flighty
                      </button>
                      <button
                        onClick={() => setModal('calendar')}
                        className="text-xs border border-slate-200 text-slate-500 hover:border-alaska-teal hover:text-alaska-teal px-2.5 py-0.5 rounded-full transition-colors"
                      >
                        📧 Gmail
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  {activities.filter(a => a.type === 'flight' || !a.type).length > 0 ? (
                    <p className="text-xs text-slate-400">
                      {activities.filter(a => a.type === 'flight' || !a.type).length} flights
                    </p>
                  ) : <span />}
                  {/* delete-all flights button hidden but kept for re-enable
                  <div className="flex items-center gap-3">
                    {activities.filter(a => a.type === 'flight' || !a.type).length > 0 && (
                      <button
                        onClick={() => setConfirmDeleteAll('flights')}
                        className="text-slate-300 hover:text-red-400 text-lg leading-none transition-colors"
                        title="Delete all flights"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  */}
                </div>
              </div>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-alaska-blue border-t-transparent" />
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
                  <p className="font-medium">Couldn't load activities</p>
                  {error.includes('index') ? (
                    <p>Firestore needs a composite index for this query. Check the browser console — there's a link to create it automatically.</p>
                  ) : error.includes('configured') || error.includes('projectId') ? (
                    <p>Firebase isn't configured yet. Fill in your credentials in <code className="bg-red-100 px-1 rounded">.env.local</code> and restart the dev server.</p>
                  ) : (
                    <p>{error}</p>
                  )}
                </div>
              ) : activities.filter(a => a.type === 'flight' || !a.type).length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-slate-400">No flights yet</p>
                  <button
                    onClick={() => setModal('setup')}
                    className="bg-alaska-teal hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Set up flights
                  </button>
                </div>
              ) : (
                <ActivityLog activities={activities} earningMethod={earningMethod} onDelete={removeActivity} onUpdate={updateActivity} />
              )}
            </div>
          </div>

          {/* ── Right column (2/5) ── */}
          <div className="lg:col-span-2 flex flex-col gap-6">


            {/* Review queue */}
            {pending.length > 0 && (
              <ReviewQueue
                pending={pending}
                earningMethod={earningMethod}
                onConfirm={async (confirmed) => {
                  if (confirmed.confirmationNumber && allActivitiesByPNR.has(confirmed.confirmationNumber)) {
                    await removeActivity(allActivitiesByPNR.get(confirmed.confirmationNumber).id)
                  }
                  await addActivity({ ...confirmed, year: confirmed.year || year })
                  await dismissPending(confirmed.id)
                }}
                onSkip={dismissPending}
                onClearAll={clearAllPending}
              />
            )}

            {/* Card spend */}
            <CardSpendSection activities={activities} onDelete={removeActivity} onUpdate={updateActivity} onDeleteAll={() => setConfirmDeleteAll('card')} onAddManual={() => setModal('card')} onSync={year >= 2026 ? () => setModal('teller') : null} />
            <MiscSection activities={activities} onAdd={addActivity} onDelete={removeActivity} />



          </div>
        </div>
      </div>

      {/* Flight setup modal */}
      {modal === 'setup' && (
        <FlightSetupModal
          onSelect={choice => setModal(choice)}
          onClose={() => setModal(null)}
        />
      )}

      {/* Modal */}
      {modal && modal !== 'setup' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">
                {modal === 'flight'     && '✈️ Add Flight'}
                {modal === 'card'       && '💳 Card Spend'}
                {modal === 'teller'     && '💳 Sync Atmos Card'}
                {modal === 'calendar'   && '📧 Sync from Gmail'}
                {modal === 'flighty'    && '✈️ Import Flighty CSV'}
              </h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-5">
              {modal === 'flight' && (
                <FlightForm
                  onSubmit={async data => { await addActivity(data); setModal(null) }}
                  earningMethod={earningMethod}
                  onCancel={() => setModal(null)}
                />
              )}
              {modal === 'card' && (
                <CardSpendForm
                  onSubmit={addActivity}
                  onCancel={() => setModal(null)}
                  onDone={() => setModal(null)}
                />
              )}
              {modal === 'teller' && (
                <TellerSync
                  uid={user.uid}
                  existingTellerIds={allTellerIds}
                  onAddActivity={async data => addActivity(data)}
                  onCancel={() => setModal(null)}
                />
              )}
              {modal === 'calendar' && (
                <GmailSync
                  accessToken={calendarToken}
                  earningMethod={earningMethod}
                  onAddPending={async (data) => {
                    if (data.confirmationNumber && allActivitiesByPNR.has(data.confirmationNumber)) {
                      // PNR match — remove existing confirmed flight and re-queue for review
                      await removeActivity(allActivitiesByPNR.get(data.confirmationNumber).id)
                      await addPending(data, {})
                    } else {
                      await addPending(data, {
                        existingFlightKeys: allGmailFlightKeys,
                        existingPNRs: new Set(allActivitiesByPNR.keys()),
                      })
                    }
                  }}
                  onCancel={() => setModal(null)}
                  onRefreshToken={onRefreshGmailToken}
                  userName={user.displayName}
                  lastPoll={lastPoll}
                  onPollComplete={handlePollComplete}
                />
              )}
              {modal === 'flighty' && (
                  <FlightyImport
                    earningMethod={earningMethod}
                    onAddPending={(data) => addPending(data, { existingFlightyIds: allFlightyIds })}
                    onCancel={() => setModal(null)}
                  />
                )}
            </div>
          </div>
        </div>
      )}

      {/* Delete account confirmation */}
      {confirmDeleteAccount && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteAccount(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="font-semibold text-slate-800 mb-1">Delete your account?</h3>
              <p className="text-sm text-slate-500">
                This will permanently delete all your flights, card spend, and miscellaneous entries. This cannot be undone.
              </p>
            </div>
            <div className="flex border-t border-slate-100">
              <button
                onClick={() => setConfirmDeleteAccount(false)}
                className="flex-1 py-3 text-sm text-slate-500 hover:bg-slate-50 rounded-bl-2xl transition-colors font-medium"
              >
                Cancel
              </button>
              <div className="w-px bg-slate-100" />
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 py-3 text-sm text-red-500 hover:bg-red-50 rounded-br-2xl transition-colors font-semibold disabled:opacity-40"
              >
                {deletingAccount ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete all confirmation */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteAll(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="font-semibold text-slate-800 mb-1">
                Delete all {confirmDeleteAll === 'flights' ? 'flights' : 'card transactions'}?
              </h3>
              <p className="text-sm text-slate-500">
                This will permanently remove all {confirmDeleteAll === 'flights' ? 'flight entries' : 'card spend entries'} for {year}. This cannot be undone.
              </p>
            </div>
            <div className="flex border-t border-slate-100">
              <button
                onClick={() => setConfirmDeleteAll(null)}
                className="flex-1 py-3 text-sm text-slate-500 hover:bg-slate-50 rounded-bl-2xl transition-colors font-medium"
              >
                Cancel
              </button>
              <div className="w-px bg-slate-100" />
              <button
                onClick={async () => {
                  const toDelete = activities.filter(a =>
                    confirmDeleteAll === 'flights'
                      ? (a.type === 'flight' || !a.type)
                      : (a.type === 'card_spend' || a.type === 'anniversary_bonus')
                  )
                  for (const a of toDelete) await removeActivity(a.id)
                  setConfirmDeleteAll(null)
                }}
                className="flex-1 py-3 text-sm text-red-500 hover:bg-red-50 rounded-br-2xl transition-colors font-semibold"
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
