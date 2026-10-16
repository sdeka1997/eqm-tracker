import { useState } from 'react'
import { calculateFlightPoints, countsTowardStatus, FARE_OPTIONS, formatMonth, groupByMonth, isFlight, isManualFlight, isManualFlightOverdue, projectionSnapshot, rankFlightSuggestions } from '../utils/calculations'
import MatchPicker, { dayGapLabel, FlagNote } from './MatchPicker'
import FlightFields from './FlightFields'
import Modal from './Modal'
import { useEscapeClose } from '../hooks/useEscapeClose'
import ModalFooter from './ModalFooter'
import { useUndoDelete } from '../hooks/useUndoDelete'
import UndoToasts from './UndoToasts'

function FlightEditModal({ flight, earningMethod, editableDate, renderExtra, onSave, onDelete, onClose }) {
  useEscapeClose(onClose)
  const [distanceMiles, setDistanceMiles] = useState(flight.distanceMiles || 0)
  const [bookingType, setBookingType] = useState(flight.bookingType || '')
  const [fareOption, setFareOption] = useState(flight.fareOption || '')
  const [pnr, setPnr] = useState(flight.confirmationNumber || '')
  const [flightNumber, setFlightNumber] = useState(flight.flightNumber || '')
  const [editingFlightNumber, setEditingFlightNumber] = useState(false)
  const [date, setDate] = useState(flight.date || '')

  const fareOpts = FARE_OPTIONS[bookingType] || []
  const selectedFare = fareOpts.find(o => o.value === fareOption) || fareOpts[0]
  const livePoints = calculateFlightPoints({ earningMethod, distanceMiles, bookingType, fareOption })

  function handleSave() {
    onSave({
      distanceMiles,
      bookingType,
      fareOption,
      fareLabel: selectedFare?.label || '',
      multiplier: selectedFare?.multiplier ?? 1,
      statusPoints: livePoints,
      confirmationNumber: pnr || null,
      flightNumber: flightNumber.toUpperCase().trim() || null,
      ...(editableDate && date ? { date } : {}),
    })
  }

  return (
    <Modal onClose={onClose}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">{flight.origin} → {flight.destination}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {flight.date}
              {' · '}
              {editingFlightNumber ? (
                <input
                  autoFocus
                  value={flightNumber}
                  onChange={e => setFlightNumber(e.target.value.toUpperCase())}
                  onBlur={() => setEditingFlightNumber(false)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingFlightNumber(false) }}
                  className="font-mono text-xs border-b border-alaska-blue outline-none bg-transparent w-20 text-slate-600"
                />
              ) : (
                <span
                  onClick={() => setEditingFlightNumber(true)}
                  className="cursor-pointer hover:text-alaska-blue font-mono"
                  title="Click to edit flight number"
                >
                  {flightNumber || 'add flight #'}
                </span>
              )}
              {distanceMiles > 0 && ` · ${distanceMiles.toLocaleString()} mi`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xl font-black text-alaska-blue">+{livePoints.toLocaleString()}</div>
            <div className="text-xs text-slate-400">SP</div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <FlightFields
            distanceMiles={distanceMiles} onDistanceChange={setDistanceMiles}
            bookingType={bookingType} onBookingTypeChange={setBookingType}
            fareOption={fareOption} onFareOptionChange={setFareOption}
            {...(editableDate ? {} : { pnr, onPnrChange: setPnr })}
          />
          {editableDate && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alaska-blue"
              />
            </div>
          )}
          {renderExtra?.({ date })}
        </div>
        <ModalFooter onDelete={onDelete} onCancel={onClose} onSave={handleSave} saveDisabled={!bookingType} />
    </Modal>
  )
}

export default function ActivityLog({ activities, earningMethod, onAdd, onDelete, onUpdate, onCancellationResolved }) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [expanded, setExpanded] = useState(() => new Set(['__default__']))
  const [editing, setEditing] = useState(null)
  const { requestDelete, undo, queue: undoQueue, pendingIds } = useUndoDelete(onDelete)
  const deleteFlight = f => requestDelete(f.id, `${f.origin} → ${f.destination}`)

  const flights = activities.filter(a => isFlight(a) && !pendingIds.has(a.id))

  if (flights.length === 0) {
    return (
      <>
      <UndoToasts queue={undoQueue} onUndo={undo} />
      <div className="text-center py-12 text-slate-400">
        <div className="text-4xl mb-3">✈️</div>
        <p className="font-medium">No flights yet</p>
        <p className="text-sm">Add a flight or import from Flighty to get started</p>
      </div>
      </>
    )
  }

  const byMonth = groupByMonth(flights)
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  const editingFlight = flights.find(f => f.id === editing)

  // Same projection system as card spend: a manual flight's edit screen lets you
  // pick the synced flight it became. Matching removes the manual flight and
  // keeps a snapshot on the synced one so it can be unmatched.
  async function matchManual(manual, synced) {
    await onUpdate(synced.id, { plannedAs: projectionSnapshot(manual) })
    await onDelete(manual.id)
    setEditing(null)
  }

  function renderMatchSection(manual, { date }) {
    const synced = flights.filter(f => !isManualFlight(f) && !f.plannedAs)
    return (
      <>
        {isManualFlightOverdue(manual) && (
          <FlagNote>
            The date has passed with no booking found.
          </FlagNote>
        )}
        <MatchPicker
          label="Already booked? Pick the real flight:"
          suggestions={rankFlightSuggestions({ ...manual, date }, synced)}
          describe={f => ({
            title: `${f.origin} → ${f.destination}${f.flightNumber ? ` · ${f.flightNumber}` : ''}`,
            subtitle: [f.date, dayGapLabel(f.date, date)].filter(Boolean).join(' · '),
            right: `+${(f.statusPoints || 0).toLocaleString()} SP`,
          })}
          onMatch={f => matchManual(manual, f)}
          emptyText={`No synced ${manual.origin} → ${manual.destination} flights yet.`}
        />
      </>
    )
  }

  function renderMatchedBanner(flight) {
    const p = flight.plannedAs
    return (
      <div className="flex items-center justify-between gap-3 text-xs bg-green-50 rounded-lg px-3 py-2">
        <span className="text-green-700 min-w-0">
          ✓ Matched to your manual <span className="font-medium">{p.origin} → {p.destination}</span>
          <span className="text-green-600/70"> · {p.date}</span>
        </span>
        <button
          onClick={async () => { await onAdd(p); await onUpdate(flight.id, { plannedAs: null }); setEditing(null) }}
          className="shrink-0 text-alaska-blue hover:underline font-medium"
        >
          Unmatch
        </button>
      </div>
    )
  }

  return (
    <>
      {editingFlight && (
        <FlightEditModal
          key={editingFlight.id}
          flight={editingFlight}
          earningMethod={earningMethod}
          editableDate={isManualFlight(editingFlight)}
          renderExtra={isManualFlight(editingFlight)
            ? ({ date }) => renderMatchSection(editingFlight, { date })
            : editingFlight.plannedAs ? () => renderMatchedBanner(editingFlight) : undefined}
          onSave={updates => { onUpdate(editingFlight.id, updates); setEditing(null) }}
          onDelete={() => { deleteFlight(editingFlight); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
      <UndoToasts queue={undoQueue} onUndo={undo} />
      <div className="space-y-2">
        {months.map(month => {
          const items = byMonth[month]
          const monthSP = items.reduce((sum, f) => sum + (countsTowardStatus(f) ? (f.statusPoints || 0) : 0), 0)
          const overdueCount = items.filter(f => isManualFlightOverdue(f)).length
          const isDefault = expanded.has('__default__')
          const isOpen = isDefault ? month >= currentMonth : expanded.has(month)

          function toggleMonth() {
            setExpanded(prev => {
              const next = new Set(prev)
              if (next.has('__default__')) {
                next.delete('__default__')
                months.forEach(m => { if (m >= currentMonth) next.add(m) })
              }
              next.has(month) ? next.delete(month) : next.add(month)
              return next
            })
          }

          return (
            <div key={month} className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                onClick={toggleMonth}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-800">{formatMonth(month)}</span>
                  <span className="text-xs text-slate-400">{items.length} flight{items.length !== 1 ? 's' : ''}</span>
                  {overdueCount > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{overdueCount} overdue</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-alaska-blue">+{monthSP.toLocaleString()} SP</span>
                  <span className="text-slate-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {items.map(a => {
                    const isManual = isManualFlight(a)
                    const isOverdue = isManualFlightOverdue(a)
                    const isCounted = countsTowardStatus(a)
                    const toggleCounting = () => onUpdate(a.id, { countsTowardStatus: !isCounted })

                    return (
                    <div
                      key={a.id}
                      data-flight-key={`${a.date}|${a.origin}|${a.destination}`}
                      onClick={() => setEditing(a.id)}
                      title="Click to edit this flight"
                      className={`cursor-pointer group transition-colors ${
                        isCounted ? 'hover:bg-slate-50' : 'bg-slate-100/70 hover:bg-slate-100'
                      }${a.possibleCancellation ? ' pb-2.5' : ''}`}
                    >
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        {isManual ? (
                          <span
                            className={`text-base p-1 ${isCounted ? '' : 'opacity-60'}`}
                            title="Added by hand: a projected flight, not booked yet"
                          >
                            🗓️
                          </span>
                        ) : (
                        <button
                          onClick={e => { e.stopPropagation(); toggleCounting() }}
                          aria-pressed={!isCounted}
                          className={`text-base rounded-full p-1 transition-colors ${
                            isCounted ? 'hover:bg-slate-100' : 'bg-slate-200 opacity-60 hover:opacity-100'
                          }`}
                          title={isCounted ? 'Stop counting this flight' : 'Count this flight'}
                        >
                          ✈️
                        </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800">
                            {a.origin} → {a.destination}
                            {a.flightNumber && <span className="ml-1.5 font-normal text-slate-400">{a.flightNumber}</span>}
                            {a.confirmationNumber && <span className="ml-1.5 font-normal text-slate-300">· {a.confirmationNumber}</span>}
                          </div>
                          <div className="text-xs text-slate-400">
                            {a.date}
                            {a.distanceMiles ? ` · ${a.distanceMiles.toLocaleString()} mi` : ''}
                            {isOverdue && <span className="ml-1.5 font-medium text-amber-600">· Overdue</span>}
                            {a.plannedAs && <span className="ml-1.5 text-green-600" title={`Matched to your manual ${a.plannedAs.origin} → ${a.plannedAs.destination} (${a.plannedAs.date})`}>✓</span>}
                            {!isCounted && !isOverdue && <span className="ml-1.5 font-medium">· Not counting</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            {isManual ? (
                              <div className={`text-xs font-bold border border-dashed rounded px-1.5 py-0.5 ${isCounted ? 'text-alaska-blue border-alaska-blue/40' : 'text-slate-400 border-slate-300 line-through'}`}>
                                +{(a.statusPoints || 0).toLocaleString()} SP
                              </div>
                            ) : (
                              <>
                                <div className={`text-xs font-bold ${isCounted ? 'text-alaska-blue' : 'text-slate-400'}`}>+{(a.statusPoints || 0).toLocaleString()}</div>
                                <div className="text-xs text-slate-400">SP</div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {a.possibleCancellation && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="mx-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5"
                        >
                          <span className="text-xs text-amber-700">⚠ Possibly cancelled</span>
                          <div className="flex items-center gap-3 ml-3 shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); deleteFlight(a); onCancellationResolved?.() }}
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                              Delete
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); onUpdate(a.id, { possibleCancellation: false }); onCancellationResolved?.() }}
                              className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
