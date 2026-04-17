import { useState, useEffect } from 'react'
import { calculateFlightPoints, FARE_OPTIONS } from '../utils/calculations'
import FlightFields from './FlightFields'

const BOOKING_TYPE_SHORT = {
  alaska_direct:      'Alaska / Horizon / Hawaiian (via Alaska)',
  hawaiian_direct:    'Hawaiian (via Hawaiian)',
  partner_via_alaska: 'Partner (via Alaska)',
  partner_direct:     'Partner (direct)',
  award:              'Award',
}

function EmailPreviewModal({ subject, from, html, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate">{subject || '(no subject)'}</p>
            <p className="text-xs text-slate-400 truncate">{from}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none shrink-0">×</button>
        </div>
        <iframe
          srcDoc={html || '<p style="font-family:sans-serif;color:#888;padding:16px">(no HTML content)</p>'}
          sandbox="allow-same-origin"
          className="flex-1 w-full rounded-b-2xl"
          title="Email preview"
        />
      </div>
    </div>
  )
}

function FlightReviewCard({ flight, earningMethod, onConfirm, onSkip, onUpdate }) {
  const needsSelection = !flight.bookingType
  const [editing, setEditing] = useState(needsSelection || flight.fareSource === 'estimated' || flight.fareSource === 'default')
  const [showEmail, setShowEmail] = useState(false)
  const [bookingType, setBookingType] = useState(flight.bookingType || '')
  const [fareOption, setFareOption] = useState(flight.fareOption || '')
  const [pnr, setPnr] = useState(flight.confirmationNumber || '')
  const [distanceMiles, setDistanceMiles] = useState(flight.distanceMiles || 0)

  const fareOpts = FARE_OPTIONS[bookingType] || []
  const selectedFare = fareOpts.find(o => o.value === fareOption) || fareOpts[0]

  const livePoints = calculateFlightPoints({
    earningMethod,
    distanceMiles,
    bookingType,
    fareOption,
  })

  const needsReview = flight.fareSource === 'estimated' || flight.fareSource === 'default' || !flight.fareSource

  function handleConfirm() {
    onConfirm({
      ...flight,
      bookingType,
      fareOption,
      fareLabel: selectedFare?.label || '',
      multiplier: selectedFare?.multiplier || 1,
      distanceMiles,
      statusPoints: livePoints,
      confirmationNumber: pnr || null,
    })
  }

  return (
    <>
    {showEmail && (
      <EmailPreviewModal
        subject={flight.emailSubject}
        from={flight.emailFrom}
        html={flight.emailHtml}
        onClose={() => setShowEmail(false)}
      />
    )}
    <div className={`bg-white rounded-2xl border-2 transition-colors ${needsReview ? 'border-amber-200' : 'border-slate-100'}`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-800">
              {flight.origin} → {flight.destination}
            </span>
            {flight.flightNumber && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                {flight.flightNumber}
              </span>
            )}
            {flight.fareSource === 'gmail' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                ✓ from email
              </span>
            )}
            {needsReview && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                needs review
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-slate-500">
              {flight.date}
              {flight.distanceMiles ? ` · ${flight.distanceMiles.toLocaleString()} mi` : ''}
            </span>
            {flight.emailHtml && (
              <button
                onClick={() => setShowEmail(true)}
                className="text-xs text-alaska-blue hover:underline"
              >
                view email
              </button>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xl font-black text-alaska-blue">+{livePoints.toLocaleString()}</div>
          <div className="text-xs text-slate-400">SP</div>
        </div>
      </div>

      {/* Fare info row */}
      <div className="px-4 pb-3">
        {!editing ? (
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {BOOKING_TYPE_SHORT[bookingType] || bookingType}
              {selectedFare ? ` · ${selectedFare.label}` : ''}
              {pnr ? ` · ${pnr}` : ''}
            </div>
            <button onClick={() => setEditing(true)} className="text-xs text-alaska-blue hover:underline">
              Edit
            </button>
          </div>
        ) : (
          <div className="space-y-2 bg-slate-50 rounded-xl p-3">
            <FlightFields
              distanceMiles={distanceMiles} onDistanceChange={setDistanceMiles}
              bookingType={bookingType} onBookingTypeChange={setBookingType}
              fareOption={fareOption} onFareOptionChange={setFareOption}
              pnr={pnr} onPnrChange={setPnr}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-slate-100">
        <button
          onClick={onSkip}
          className="flex-1 py-3 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-bl-2xl transition-colors font-medium"
        >
          Skip
        </button>
        <div className="w-px bg-slate-100" />
        <button
          onClick={handleConfirm}
          disabled={!bookingType}
          className="flex-1 py-3 text-sm text-alaska-blue hover:bg-alaska-blue hover:text-white rounded-br-2xl transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm ✓
        </button>
      </div>
    </div>
    </>
  )
}

function CardSpendReviewCard({ item, onConfirm, onSkip }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-100">
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-800">💳 Card Spend</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {item.institutionName || 'Atmos Card'}
            </span>
          </div>
          <div className="text-sm text-slate-500 mt-0.5">{item.date}</div>
          {item.notes && (
            <div className="text-xs text-slate-400 mt-0.5 truncate">{item.notes}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-alaska-blue">+{item.statusPoints.toLocaleString()}</div>
          <div className="text-xs text-slate-400">SP</div>
          {item.amount && (
            <div className="text-xs text-slate-400">${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          )}
        </div>
      </div>
      <div className="flex border-t border-slate-100">
        <button
          onClick={onSkip}
          className="flex-1 py-3 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-bl-2xl transition-colors font-medium"
        >
          Skip
        </button>
        <div className="w-px bg-slate-100" />
        <button
          onClick={() => onConfirm(item)}
          className="flex-1 py-3 text-sm text-alaska-blue hover:bg-alaska-blue hover:text-white rounded-br-2xl transition-colors font-semibold"
        >
          Confirm ✓
        </button>
      </div>
    </div>
  )
}

export default function ReviewQueue({ uid, pending, earningMethod, onConfirm, onSkip, onClearAll }) {
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [clearing, setClearing] = useState(false)

  if (pending.length === 0) return null

  const flights = pending.filter(p => p.type === 'flight' || !p.type)
  const cardSpend = pending.filter(p => p.type === 'card_spend')

  async function handleConfirmAll() {
    setConfirmingAll(true)
    for (const item of pending) {
      await onConfirm(item)
    }
    setConfirmingAll(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-slate-800">
            Review Queue
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full">
              {pending.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {flights.length > 0 && cardSpend.length > 0
              ? `${flights.length} flight${flights.length !== 1 ? 's' : ''} · ${cardSpend.length} card transaction${cardSpend.length !== 1 ? 's' : ''}`
              : flights.length > 0
              ? `${flights.length} flight${flights.length !== 1 ? 's' : ''} to review`
              : `${cardSpend.length} card transaction${cardSpend.length !== 1 ? 's' : ''} to review`}
          </p>
        </div>
        <div className="flex gap-2">
          {pending.length > 1 && (
            <button
              onClick={handleConfirmAll}
              disabled={confirmingAll || clearing}
              className="text-xs bg-alaska-blue/10 hover:bg-alaska-blue hover:text-white text-alaska-blue px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {confirmingAll ? 'Confirming…' : 'Confirm all'}
            </button>
          )}
          {onClearAll && (
            <button
              onClick={async () => { setClearing(true); await onClearAll(); setClearing(false) }}
              disabled={clearing || confirmingAll}
              className="text-xs border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {pending.map(item => (
          item.type === 'card_spend' ? (
            <CardSpendReviewCard
              key={item.id}
              item={item}
              onConfirm={confirmed => onConfirm(confirmed)}
              onSkip={() => onSkip(item.id)}
            />
          ) : (
            <FlightReviewCard
              key={item.id}
              flight={item}
              earningMethod={earningMethod}
              onConfirm={confirmed => onConfirm(confirmed)}
              onSkip={() => onSkip(item.id)}
              onUpdate={() => {}}
            />
          )
        ))}
      </div>
    </div>
  )
}
