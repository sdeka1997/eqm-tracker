import { BOOKING_TYPES, FARE_OPTIONS } from '../utils/calculations'

const sizeClass = {
  sm: 'text-xs rounded-lg border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-alaska-blue bg-white',
  md: 'text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alaska-blue bg-white',
}
const labelClass = {
  sm: 'block text-xs font-medium text-slate-500 mb-1',
  md: 'block text-xs font-medium text-slate-500 mb-1',
}

export default function FlightFields({
  distanceMiles, onDistanceChange,
  bookingType, onBookingTypeChange,
  fareOption, onFareOptionChange,
  pnr, onPnrChange,
  size = 'md',
  hideDistance = false,
}) {
  const cls = sizeClass[size]
  const lbl = labelClass[size]
  const fareOpts = FARE_OPTIONS[bookingType] || []

  function handleBookingTypeChange(bt) {
    onBookingTypeChange(bt)
    onFareOptionChange(FARE_OPTIONS[bt]?.[0]?.value || '')
  }

  return (
    <>
      {!hideDistance && (
      <div>
        <label className={lbl}>Distance (miles)</label>
        <input
          type="number"
          min="0"
          value={distanceMiles}
          onChange={e => onDistanceChange(parseInt(e.target.value) || 0)}
          className={`w-full ${cls}`}
        />
      </div>
      )}

      <div>
        <label className={lbl}>How was this booked?</label>
        <select
          value={bookingType}
          onChange={e => handleBookingTypeChange(e.target.value)}
          className={`w-full ${cls}`}
        >
          <option value="" disabled>Select booking type…</option>
          {BOOKING_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {bookingType && bookingType !== 'award' && (
        <div>
          <label className={lbl}>Fare class</label>
          <select
            value={fareOption}
            onChange={e => onFareOptionChange(e.target.value)}
            className={`w-full ${cls}`}
          >
            {fareOpts.map(o => (
              <option key={o.value} value={o.value}>{o.label} · {o.multiplier}×</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={lbl}>Confirmation # (optional)</label>
        <input
          type="text"
          value={pnr}
          onChange={e => onPnrChange(e.target.value.toUpperCase())}
          placeholder="e.g. ABC123"
          className={`w-full ${cls} uppercase placeholder:normal-case`}
        />
      </div>
    </>
  )
}
