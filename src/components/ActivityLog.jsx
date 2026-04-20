import { useState } from 'react'
import { calculateFlightPoints, FARE_OPTIONS, formatMonth, groupByMonth, isFlight } from '../utils/calculations'
import FlightFields from './FlightFields'
import Modal from './Modal'
import { useEscapeClose } from '../hooks/useEscapeClose'

function FlightEditModal({ flight, earningMethod, onSave, onClose }) {
  useEscapeClose(onClose)
  const [distanceMiles, setDistanceMiles] = useState(flight.distanceMiles || 0)
  const [bookingType, setBookingType] = useState(flight.bookingType || '')
  const [fareOption, setFareOption] = useState(flight.fareOption || '')
  const [pnr, setPnr] = useState(flight.confirmationNumber || '')
  const [flightNumber, setFlightNumber] = useState(flight.flightNumber || '')
  const [editingFlightNumber, setEditingFlightNumber] = useState(false)

  const fareOpts = FARE_OPTIONS[bookingType] || []
  const selectedFare = fareOpts.find(o => o.value === fareOption) || fareOpts[0]
  const livePoints = calculateFlightPoints({ earningMethod, distanceMiles, bookingType, fareOption })

  function handleSave() {
    onSave({
      distanceMiles,
      bookingType,
      fareOption,
      fareLabel: selectedFare?.label || '',
      multiplier: selectedFare?.multiplier || 1,
      statusPoints: livePoints,
      confirmationNumber: pnr || null,
      flightNumber: flightNumber.toUpperCase().trim() || null,
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
            pnr={pnr} onPnrChange={setPnr}
          />
        </div>
        <div className="flex border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 text-sm text-slate-500 hover:bg-slate-50 rounded-bl-2xl transition-colors font-medium">Cancel</button>
          <div className="w-px bg-slate-100" />
          <button
            onClick={handleSave}
            disabled={!bookingType}
            className="flex-1 py-3 text-sm text-alaska-blue hover:bg-alaska-blue hover:text-white rounded-br-2xl transition-colors font-semibold disabled:opacity-40"
          >
            Save
          </button>
        </div>
    </Modal>
  )
}

export default function ActivityLog({ activities, earningMethod, onDelete, onUpdate }) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [expanded, setExpanded] = useState(() => new Set(['__default__']))
  const [editing, setEditing] = useState(null)

  const flights = activities.filter(a => isFlight(a))

  if (flights.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <div className="text-4xl mb-3">✈️</div>
        <p className="font-medium">No flights yet</p>
        <p className="text-sm">Add a flight or import from Flighty to get started</p>
      </div>
    )
  }

  const byMonth = groupByMonth(flights)
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  const editingFlight = flights.find(f => f.id === editing)

  return (
    <>
      {editingFlight && (
        <FlightEditModal
          flight={editingFlight}
          earningMethod={earningMethod}
          onSave={updates => { onUpdate(editingFlight.id, updates); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="space-y-2">
        {months.map(month => {
          const items = byMonth[month]
          const monthSP = items.reduce((sum, f) => sum + (f.statusPoints || 0), 0)
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
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-alaska-blue">+{monthSP.toLocaleString()} SP</span>
                  <span className="text-slate-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {items.map(a => (
                    <div
                      key={a.id}
                      onClick={() => setEditing(a.id)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer group transition-colors"
                    >
                      <span className="text-base">✈️</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800">
                          {a.origin} → {a.destination}
                          {a.flightNumber && <span className="ml-1.5 font-normal text-slate-400">{a.flightNumber}</span>}
                          {a.confirmationNumber && <span className="ml-1.5 font-normal text-slate-300">· {a.confirmationNumber}</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                          {a.date}
                          {a.distanceMiles ? ` · ${a.distanceMiles.toLocaleString()} mi` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-bold text-alaska-blue">+{(a.statusPoints || 0).toLocaleString()}</div>
                          <div className="text-xs text-slate-400">SP</div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(a.id) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 text-lg leading-none"
                          title="Delete"
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
        })}
      </div>
    </>
  )
}
