import { BOOKING_TYPES, FARE_OPTIONS } from '../utils/calculations'
import { INPUT_CLS, INPUT_CLS_SM, LABEL_CLS } from '../utils/styles'

const sizeClass = { sm: INPUT_CLS_SM, md: INPUT_CLS }
const labelClass = { sm: LABEL_CLS, md: LABEL_CLS }

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
