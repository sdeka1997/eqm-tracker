import { useState, useEffect } from 'react'
import { calculateDistance } from '../utils/airports'
import { calculateFlightPoints, FARE_OPTIONS, getToday } from '../utils/calculations'
import Spinner from './Spinner'

// Simulated Gmail sync for demo mode: plays out the scan, then "finds" one of
// a few canned confirmation emails that aren't already in the account, plus a
// cancellation notice for one of the planned flights.

const BOOKINGS = [
  { pnr: 'SANDGO', flightNumber: 'AS 470',  origin: 'SEA', destination: 'SAN', inDays: 30, fareOption: 'first_DI',   cabin: 'First (D)' },
  { pnr: 'PSPSUN', flightNumber: 'AS 1176', origin: 'SEA', destination: 'PSP', inDays: 40, fareOption: 'economy_HK', cabin: 'Main (K)' },
  { pnr: 'MEXCTY', flightNumber: 'AS 288',  origin: 'SEA', destination: 'MEX', inDays: 48, fareOption: 'first_DI',   cabin: 'First (D)' },
]

// A planned flight in the sample data that the scan reports as cancelled.
const CANCELLED_PNR = 'LAXHOL'

const PHASES = [
  { text: 'Connecting to Gmail (read-only)…', ms: 800 },
  { text: 'Searching for airline confirmation emails…', ms: 1300 },
  { text: 'Reading itineraries and fare classes…', ms: 1000 },
]

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function emailHtml(b, date) {
  return `
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:520px;margin:24px auto;color:#1e293b">
  <div style="background:#01426a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
    <strong>Your trip confirmation</strong> <span style="opacity:.7">(sample email for the demo)</span>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 8px 8px">
    <p>Confirmation code: <strong>${b.pnr}</strong></p>
    <p><strong>Flight ${b.flightNumber}</strong> · ${b.origin} → ${b.destination} · ${date}</p>
    <p>Class of service: <strong>${b.cabin}</strong></p>
  </div>
</div>`
}

function toPending(b) {
  const date = addDays(getToday(), b.inDays)
  const distanceMiles = calculateDistance(b.origin, b.destination) || 0
  const fare = FARE_OPTIONS.alaska_direct.find(o => o.value === b.fareOption)
  return {
    type: 'flight',
    origin: b.origin,
    destination: b.destination,
    date,
    flightNumber: b.flightNumber,
    bookingType: 'alaska_direct',
    fareOption: b.fareOption,
    fareLabel: fare?.label || '',
    multiplier: fare?.multiplier ?? 1,
    distanceMiles,
    confirmationNumber: b.pnr,
    fareSource: 'gmail',
    importedFrom: 'gmail_sync',
    emailSubject: `Your Alaska Airlines confirmation: ${b.pnr}`,
    emailFrom: 'Alaska Airlines <demo@example.com>',
    emailHtml: emailHtml(b, date),
    statusPoints: calculateFlightPoints({ earningMethod: 'distance', distanceMiles, bookingType: 'alaska_direct', fareOption: b.fareOption }),
  }
}

export default function DemoGmailScan({ knownPNRs, flights, onAddPending, onFlagCancellation, onImported, onClose }) {
  const [phase, setPhase] = useState(0)
  const [found] = useState(() => {
    const b = BOOKINGS.find(b => !knownPNRs.has(b.pnr))
    return b ? toPending(b) : null
  })
  const [cancelled] = useState(() =>
    flights.find(f => f.type === 'flight' && f.confirmationNumber === CANCELLED_PNR && !f.possibleCancellation) || null
  )
  const emailCount = (found ? 1 : 0) + (cancelled ? 1 : 0)

  useEffect(() => {
    if (phase >= PHASES.length) return
    const t = setTimeout(() => setPhase(p => p + 1), PHASES[phase].ms)
    return () => clearTimeout(t)
  }, [phase])

  async function handleImport() {
    if (found) await onAddPending(found)
    if (cancelled) await onFlagCancellation(cancelled)
    onImported({ flagged: cancelled })
    onClose()
  }

  // Nothing new still counts as a finished scan, so the tour never waits forever.
  function handleClose() {
    if (!scanning && emailCount === 0) onImported({ flagged: null })
    onClose()
  }

  const scanning = phase < PHASES.length

  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
        Demo: this is a simulated scan. Signed-in users connect their real inbox with read-only access.
      </p>

      <ul className="space-y-2">
        {PHASES.map((p, i) => (
          <li key={p.text} className={`flex items-center gap-2 text-sm ${i <= phase ? 'text-slate-700' : 'text-slate-300'}`}>
            <span className="w-4 flex justify-center">
              {i < phase ? <span className="text-green-600">✓</span> : i === phase ? <Spinner size="sm" /> : '·'}
            </span>
            {p.text}
          </li>
        ))}
      </ul>

      {!scanning && (emailCount > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-medium">Found {emailCount} new email{emailCount !== 1 ? 's' : ''}</p>
          {found && (
            <div className="border-2 border-green-200 bg-green-50/50 rounded-xl p-3 space-y-1">
              <p className="text-xs text-green-700 font-medium">New booking · goes to the review queue</p>
              <p className="text-sm font-semibold text-slate-800">
                {found.origin} → {found.destination}
                <span className="ml-2 text-xs font-normal text-slate-500">{found.flightNumber} · {found.date}</span>
              </p>
              <p className="text-xs text-slate-500">
                {found.fareLabel} · {found.confirmationNumber} · +{found.statusPoints.toLocaleString()} SP
              </p>
            </div>
          )}
          {cancelled && (
            <div className="border-2 border-amber-200 bg-amber-50/50 rounded-xl p-3 space-y-1">
              <p className="text-xs text-amber-700 font-medium">Cancellation notice · flags the existing flight</p>
              <p className="text-sm font-semibold text-slate-800">
                {cancelled.origin} → {cancelled.destination}
                <span className="ml-2 text-xs font-normal text-slate-500">{cancelled.flightNumber} · {cancelled.date}</span>
              </p>
              <p className="text-xs text-slate-500">{cancelled.confirmationNumber} · {cancelled.statusPoints.toLocaleString()} SP at stake</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-2">No new emails found.</p>
      ))}

      <div className="flex gap-2">
        <button
          onClick={handleClose}
          className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50"
        >
          {emailCount ? 'Cancel' : 'Close'}
        </button>
        {emailCount > 0 && (
          <button
            onClick={handleImport}
            disabled={scanning}
            className="flex-1 bg-alaska-blue hover:bg-alaska-navy disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Import
          </button>
        )}
      </div>
    </div>
  )
}
