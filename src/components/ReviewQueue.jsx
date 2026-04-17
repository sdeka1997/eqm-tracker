import { useState, useEffect, useRef } from 'react'
import { calculateFlightPoints, FARE_OPTIONS, BOOKING_TYPE_SHORT } from '../utils/calculations'
import FlightFields from './FlightFields'
import Modal from './Modal'
import { useEscapeClose } from '../hooks/useEscapeClose'

function EmailPreviewModal({ subject, from, html, onClose }) {
  useEscapeClose(onClose)

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" className="max-h-[85vh] flex flex-col">
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
    </Modal>
  )
}

function FlightReviewCard({ flight, earningMethod, onConfirm, onSkip }) {
  const needsSelection = !flight.bookingType
  const [editing, setEditing] = useState(needsSelection || flight.fareSource === 'estimated' || flight.fareSource === 'default')
  const [showEmail, setShowEmail] = useState(false)
  const [bookingType, setBookingType] = useState(flight.bookingType || '')
  const [fareOption, setFareOption] = useState(flight.fareOption || '')
  const [pnr, setPnr] = useState(flight.confirmationNumber || '')
  const [distanceMiles, setDistanceMiles] = useState(flight.distanceMiles || 0)

  const fareOpts = FARE_OPTIONS[bookingType] || []
  const selectedFare = fareOpts.find(o => o.value === fareOption) || fareOpts[0]

  const livePoints = calculateFlightPoints({ earningMethod, distanceMiles, bookingType, fareOption })
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
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-800">{flight.origin} → {flight.destination}</span>
            {flight.flightNumber && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{flight.flightNumber}</span>
            )}
            {flight.fareSource === 'gmail' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ from email</span>
            )}
            {needsReview && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">needs review</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-slate-500">
              {flight.date}{flight.distanceMiles ? ` · ${flight.distanceMiles.toLocaleString()} mi` : ''}
            </span>
            {flight.emailHtml && (
              <button onClick={() => setShowEmail(true)} className="text-xs text-alaska-blue hover:underline">view email</button>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-alaska-blue">+{livePoints.toLocaleString()}</div>
          <div className="text-xs text-slate-400">SP</div>
        </div>
      </div>
      <div className="px-4 pb-3">
        {!editing ? (
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {BOOKING_TYPE_SHORT[bookingType] || bookingType}
              {selectedFare ? ` · ${selectedFare.label}` : ''}
              {pnr ? ` · ${pnr}` : ''}
            </div>
            <button onClick={() => setEditing(true)} className="text-xs text-alaska-blue hover:underline">Edit</button>
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
      <div className="flex border-t border-slate-100">
        <button onClick={onSkip} className="flex-1 py-3 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-bl-2xl transition-colors font-medium">Skip</button>
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
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{item.institutionName || 'Atmos Card'}</span>
          </div>
          <div className="text-sm text-slate-500 mt-0.5">{item.date}</div>
          {item.notes && <div className="text-xs text-slate-400 mt-0.5 truncate">{item.notes}</div>}
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
        <button onClick={onSkip} className="flex-1 py-3 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-bl-2xl transition-colors font-medium">Skip</button>
        <div className="w-px bg-slate-100" />
        <button onClick={() => onConfirm(item)} className="flex-1 py-3 text-sm text-alaska-blue hover:bg-alaska-blue hover:text-white rounded-br-2xl transition-colors font-semibold">Confirm ✓</button>
      </div>
    </div>
  )
}

// ── Mobile swipe card ────────────────────────────────────────────────────────

function SwipeCardContent({ item, earningMethod, confirmOpacity, dismissOpacity, onConfirm, onDismiss, onEditingChange }) {
  const isFlight = item.type === 'flight' || !item.type
  const [editing, setEditing] = useState(!item.bookingType || item.fareSource === 'estimated' || item.fareSource === 'default')
  const [showEmail, setShowEmail] = useState(false)
  const [bookingType, setBookingType] = useState(item.bookingType || '')
  const [fareOption, setFareOption] = useState(item.fareOption || '')
  const [pnr, setPnr] = useState(item.confirmationNumber || '')
  const [distanceMiles, setDistanceMiles] = useState(item.distanceMiles || 0)

  const needsReview = isFlight && (item.fareSource === 'estimated' || item.fareSource === 'default' || !item.fareSource)
  const fareOpts = FARE_OPTIONS[bookingType] || []
  const selectedFare = fareOpts.find(o => o.value === fareOption) || fareOpts[0]
  const livePoints = isFlight
    ? calculateFlightPoints({ earningMethod, distanceMiles, bookingType, fareOption })
    : (item.statusPoints || 0)

  useEffect(() => {
    setEditing(!item.bookingType || item.fareSource === 'estimated' || item.fareSource === 'default')
    setBookingType(item.bookingType || '')
    setFareOption(item.fareOption || '')
    setPnr(item.confirmationNumber || '')
    setDistanceMiles(item.distanceMiles || 0)
    setShowEmail(false)
  }, [item.id])

  useEffect(() => { onEditingChange?.(editing) }, [editing])

  function handleConfirmTap() {
    if (isFlight) {
      onConfirm({ bookingType, fareOption, fareLabel: selectedFare?.label || '', multiplier: selectedFare?.multiplier || 1, distanceMiles, statusPoints: livePoints, confirmationNumber: pnr || null })
    } else {
      onConfirm({})
    }
  }

  return (
    <>
      {showEmail && (
        <EmailPreviewModal subject={item.emailSubject} from={item.emailFrom} html={item.emailHtml} onClose={() => setShowEmail(false)} />
      )}
      <div className={`bg-white rounded-2xl border-2 shadow-lg overflow-hidden relative select-none ${needsReview ? 'border-amber-200' : 'border-slate-100'}`}>
        {/* Confirm overlay */}
        <div className="absolute inset-0 bg-green-500/20 rounded-2xl flex items-center justify-start pl-5 pointer-events-none z-10" style={{ opacity: confirmOpacity }}>
          <span className="text-green-600 text-3xl font-black border-4 border-green-500 rounded-xl px-2.5 py-0.5" style={{ transform: 'rotate(-15deg)' }}>✓</span>
        </div>
        {/* Dismiss overlay */}
        <div className="absolute inset-0 bg-red-500/20 rounded-2xl flex items-center justify-end pr-5 pointer-events-none z-10" style={{ opacity: dismissOpacity }}>
          <span className="text-red-500 text-3xl font-black border-4 border-red-400 rounded-xl px-2.5 py-0.5" style={{ transform: 'rotate(15deg)' }}>✕</span>
        </div>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-slate-800">
                {isFlight ? `${item.origin} → ${item.destination}` : '💳 Card Spend'}
              </span>
              {item.flightNumber && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{item.flightNumber}</span>
              )}
              {needsReview && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">needs review</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-slate-500">
                {item.date}
                {isFlight && item.distanceMiles ? ` · ${item.distanceMiles.toLocaleString()} mi` : ''}
                {!isFlight && item.notes ? ` · ${item.notes}` : ''}
              </span>
              {item.emailHtml && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); setShowEmail(true) }}
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

        {/* Fare info / edit for flights */}
        {isFlight && (
          <div className="px-4 pb-3">
            {!editing ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {bookingType ? `${BOOKING_TYPE_SHORT[bookingType]}${selectedFare ? ` · ${selectedFare.label}` : ''}` : 'Tap Edit to set fare'}
                  {pnr ? ` · ${pnr}` : ''}
                </span>
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); setEditing(true) }}
                  className="text-xs text-alaska-blue hover:underline ml-2 shrink-0"
                >
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
                <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-700 font-medium">
                  Done editing ↑
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex border-t border-slate-100" onPointerDown={e => e.stopPropagation()}>
          <button
            onClick={e => { e.stopPropagation(); onDismiss() }}
            className="flex-1 py-3 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-bl-2xl transition-colors font-medium"
          >
            ← Skip
          </button>
          <div className="w-px bg-slate-100" />
          <button
            onClick={e => { e.stopPropagation(); handleConfirmTap() }}
            disabled={isFlight && !bookingType}
            className="flex-1 py-3 text-sm text-alaska-blue hover:bg-alaska-blue hover:text-white rounded-br-2xl transition-colors font-semibold disabled:opacity-40"
          >
            Confirm →
          </button>
        </div>
      </div>
    </>
  )
}


function CardPeek({ item }) {
  const isFlight = item.type === 'flight' || !item.type
  const needsReview = isFlight && (!item.bookingType || item.fareSource === 'estimated' || item.fareSource === 'default' || !item.fareSource)
  return (
    <div className={`bg-white rounded-2xl border-2 px-4 py-4 shadow-lg ${needsReview ? 'border-amber-200' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-800">
              {isFlight ? `${item.origin} → ${item.destination}` : '💳 Card Spend'}
            </span>
            {needsReview && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">needs review</span>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {item.date}
            {isFlight && item.distanceMiles ? ` · ${item.distanceMiles.toLocaleString()} mi` : ''}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-alaska-blue">+{(item.statusPoints || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-400">SP</div>
        </div>
      </div>
    </div>
  )
}

function SwipeQueue({ pending, earningMethod, onConfirm, onSkip }) {
  const [dismissedIds, setDismissedIds] = useState(new Set())
  const [confirmedIds, setConfirmedIds] = useState(new Set())
  const [undoQueue, setUndoQueue] = useState([]) // [{ id, label, timeoutId }]
  const [offsetX, setOffsetX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [exitDir, setExitDir] = useState(null)
  const [entering, setEntering] = useState(false)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)

  const THRESHOLD = 80

  const queue = pending.filter(p => !dismissedIds.has(p.id) && !confirmedIds.has(p.id))
  const currentItem = queue[0]
  const nextItem = queue[1]

  const prevCurrentIdRef = useRef(currentItem?.id)
  useEffect(() => {
    if (currentItem?.id && currentItem.id !== prevCurrentIdRef.current) {
      setEntering(true)
      const t = setTimeout(() => setEntering(false), 280)
      prevCurrentIdRef.current = currentItem.id
      return () => clearTimeout(t)
    }
  }, [currentItem?.id])

  const confirmOpacity = Math.min(1, Math.max(0, offsetX / THRESHOLD))
  const dismissOpacity = Math.min(1, Math.max(0, -offsetX / THRESHOLD))
  const rotation = offsetX / 18

  const cardTransform = exitDir
    ? `translateX(${exitDir === 'right' ? '130vw' : '-130vw'}) rotate(${exitDir === 'right' ? 25 : -25}deg)`
    : `translateX(${offsetX}px) rotate(${rotation}deg)`

  const cardTransition = exitDir ? 'transform 0.28s ease-out' : 'none'

  function handlePointerDown(e) {
    startXRef.current = e.clientX
    isDraggingRef.current = true
    setIsDragging(true)
    setEntering(false)
  }

  function handlePointerMove(e) {
    if (!isDraggingRef.current) return
    setOffsetX(e.clientX - startXRef.current)
  }

  function handlePointerUp() {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    if (offsetX >= THRESHOLD) doConfirm()
    else if (offsetX <= -THRESHOLD) doDismiss()
    else setOffsetX(0)
  }

  function doConfirm(item = currentItem, updatedData = {}) {
    if (!item) return
    setExitDir('right')
    setTimeout(() => {
      setConfirmedIds(s => new Set([...s, item.id]))
      setExitDir(null)
      setOffsetX(0)
      onConfirm({ ...item, ...updatedData })
    }, 280)
  }

  function doDismiss(item = currentItem) {
    if (!item) return
    const label = (item.type === 'flight' || !item.type) ? `${item.origin} → ${item.destination}` : 'Card spend'
    setExitDir('left')
    const timeoutId = setTimeout(() => {
      onSkip(item.id)
      setUndoQueue(q => q.filter(u => u.id !== item.id))
    }, 4000)
    setUndoQueue(q => [...q, { id: item.id, label, timeoutId }])
    setTimeout(() => {
      setDismissedIds(s => new Set([...s, item.id]))
      setExitDir(null)
      setOffsetX(0)
    }, 280)
  }

  function handleUndo(id) {
    const entry = undoQueue.find(u => u.id === id)
    if (entry) clearTimeout(entry.timeoutId)
    setUndoQueue(q => q.filter(u => u.id !== id))
    setDismissedIds(s => { const n = new Set(s); n.delete(id); return n })
  }

  return (
    <div className="space-y-2">
      {/* Undo toasts */}
      {undoQueue.map(u => (
        <div key={u.id} className="flex items-center justify-between bg-slate-800 text-white px-4 py-3 rounded-xl text-sm">
          <span className="text-slate-300">Dismissed <span className="font-medium text-white">{u.label}</span></span>
          <button onClick={() => handleUndo(u.id)} className="ml-4 font-semibold text-alaska-teal shrink-0">Undo</button>
        </div>
      ))}

      {queue.length > 0 ? (
        <div className="relative">
          {/* Minimal peek card — always shorter than the current card, so it hides naturally behind it */}
          {nextItem && (
            <div
              className="absolute inset-x-0 top-2 pointer-events-none"
              style={{ transform: 'scale(0.96)', transformOrigin: 'top center', zIndex: 1 }}
            >
              <CardPeek item={nextItem} />
            </div>
          )}

          {/* Current swipeable card — position: relative keeps container height correct */}
          <div
            className="relative cursor-grab active:cursor-grabbing"
            style={entering && !exitDir
              ? { animation: 'swipe-card-enter 0.28s ease-out forwards', zIndex: 2, touchAction: 'none' }
              : { transform: cardTransform, transition: cardTransition, zIndex: 2, touchAction: 'none' }
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <SwipeCardContent
              item={currentItem}
              earningMethod={earningMethod}
              confirmOpacity={confirmOpacity}
              dismissOpacity={dismissOpacity}
              onConfirm={(updatedData) => doConfirm(currentItem, updatedData)}
              onDismiss={() => doDismiss(currentItem)}
            />
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm font-medium text-slate-700">All caught up!</p>
          <p className="text-xs text-slate-400 mt-0.5">Nothing left to review</p>
        </div>
      )}

      {queue.length > 1 && (
        <p className="text-center text-xs text-slate-400 mt-1">{queue.length} remaining · swipe right to confirm, left to skip</p>
      )}
      {queue.length === 1 && (
        <p className="text-center text-xs text-slate-400 mt-1">swipe right to confirm, left to skip</p>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

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

      {/* Mobile: swipe view */}
      <div className="sm:hidden">
        <SwipeQueue
          pending={pending}
          earningMethod={earningMethod}
          onConfirm={onConfirm}
          onSkip={onSkip}
        />
      </div>

      {/* Desktop: list view */}
      <div className="hidden sm:block space-y-3">
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
            />
          )
        ))}
      </div>
    </div>
  )
}
