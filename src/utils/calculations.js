const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export const isFlight = (a) => a.type === 'flight'
export const isCardItem = (a) => a.type === 'card_spend' || a.type === 'anniversary_bonus' || a.type === 'card_projection'
// A flight added by hand is a projection: not booked as far as the app knows.
// Every real flight arrives through sync (Gmail, Flighty), which sets
// importedFrom. Manual flights are placeholders for planning: each one is
// either matched to the synced flight it became or deleted.
export const isManualFlight = (a) => isFlight(a) && !a.importedFrom

const MATCH_DAYS = 3

// The manual flight a newly synced booking probably is: same route within a
// few days, or the same flight number on the same date. Offered as a
// "Replace your manual flight" box on the review card.
export function findBookedMatch(manual, candidates) {
  const days = (a, b) => Math.abs(new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000
  return candidates.find(f =>
    f.id !== manual.id && isFlight(f) && !isManualFlight(f) && (
      (f.origin === manual.origin && f.destination === manual.destination && days(f.date, manual.date) <= MATCH_DAYS) ||
      (!!f.flightNumber && f.flightNumber === manual.flightNumber && f.date === manual.date)
    )
  ) || null
}

// A manual flight whose date has passed was never matched to a booking, so the
// trip didn't happen as planned. It stops counting until matched or deleted.
export const isManualFlightOverdue = (a, today = getToday()) =>
  isManualFlight(a) && (a.date || '') < today

// Manual flights always count until overdue; their old counting toggle is
// ignored. Synced flights follow the ✈️ toggle.
export const countsTowardStatus = (a, today) => {
  if (!isFlight(a)) return true
  if (isManualFlight(a)) return !isManualFlightOverdue(a, today)
  return a.countsTowardStatus !== false
}
export const getToday = () => new Date().toISOString().slice(0, 10)

export function formatMonth(yearMonth) {
  const [y, m] = yearMonth.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`
}

export function groupByMonth(items) {
  const byMonth = {}
  for (const item of items) {
    const month = (item.date || '').slice(0, 7)
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(item)
  }
  return byMonth
}

export const BOOKING_TYPE_SHORT = {
  alaska_direct:      'Alaska / Horizon / Hawaiian (via Alaska)',
  hawaiian_direct:    'Hawaiian (via Hawaiian)',
  partner_via_alaska: 'Partner (via Alaska)',
  partner_direct:     'Partner (direct)',
  award:              'Atmos Award',
  partner_award:      'Partner Award',
}

export const TIERS = [
  { name: 'Silver',   points: 20000,  color: 'bg-slate-400',  textColor: 'text-slate-600',  oneworld: 'Ruby' },
  { name: 'Gold',     points: 40000,  color: 'bg-yellow-500', textColor: 'text-yellow-700', oneworld: 'Sapphire' },
  { name: 'Platinum', points: 80000,  color: 'bg-sky-500',    textColor: 'text-sky-700',    oneworld: 'Emerald' },
  { name: 'Titanium', points: 135000, color: 'bg-purple-600', textColor: 'text-purple-700', oneworld: 'Emerald' },
]

export const CURRENT_YEAR = new Date().getFullYear()

export const EARNING_METHODS = [
  { value: 'distance', label: 'Distance-based' },
  { value: 'spend',    label: 'Spend-based (5 SP/$1 on ticket)' },
  { value: 'segment',  label: 'Segment-based (500 SP/segment)' },
]

// Booking context — determines which earning table applies
export const BOOKING_TYPES = [
  { value: 'alaska_direct',      label: 'Alaska / Horizon / Hawaiian (via Alaska)' },
  { value: 'hawaiian_direct',    label: 'Hawaiian (via Hawaiian)' },
  { value: 'partner_via_alaska', label: 'Partner (via Alaska)' },
  { value: 'partner_direct',     label: 'Partner (direct)' },
  { value: 'award',              label: 'Atmos Award' },
  { value: 'partner_award',      label: 'Partner Award' },
]

// Fare options per booking type: { value, label, multiplier }
export const FARE_OPTIONS = {
  alaska_direct: [
    { value: 'saver',         label: 'Saver',              multiplier: 0.30 },
    { value: 'economy_std',   label: 'Economy',            multiplier: 1.00 },
    { value: 'economy_HK',    label: 'Economy (H/K)',      multiplier: 1.25 },
    { value: 'economy_YB',    label: 'Economy (Y/B)',      multiplier: 1.50 },
    { value: 'first_DI',      label: 'First (D/I)',        multiplier: 1.50 },
    { value: 'first_C',       label: 'First (C)',          multiplier: 1.75 },
    { value: 'first_J',       label: 'First (J)',          multiplier: 2.00 },
  ],
  hawaiian_direct: [
    { value: 'saver',         label: 'Saver',              multiplier: 0.30 },
    { value: 'economy_std',   label: 'Economy',            multiplier: 1.00 },
    { value: 'economy_QVBS',  label: 'Economy (Q/V/B/S)', multiplier: 1.25 },
    { value: 'economy_YWX',   label: 'Economy (Y/W/X)',    multiplier: 1.50 },
    { value: 'first_CAD',     label: 'First (C/A/D)',      multiplier: 1.50 },
    { value: 'first_P',       label: 'First (P)',          multiplier: 1.75 },
    { value: 'first_FJ',      label: 'First (F/J)',        multiplier: 2.00 },
  ],
  partner_via_alaska: [
    { value: 'economy',       label: 'Economy',                multiplier: 1.00 },
    { value: 'disc_economy',  label: 'Discount Economy',       multiplier: 1.00 },
    { value: 'prem_economy',  label: 'Premium Economy',        multiplier: 1.50 },
    { value: 'dom_first',     label: 'Domestic First',         multiplier: 1.50 },
    { value: 'intl_business', label: 'International Business', multiplier: 2.50 },
    { value: 'intl_first',    label: 'International First',    multiplier: 3.50 },
  ],
  partner_direct: [
    { value: 'disc_economy',  label: 'Discount Economy',multiplier: 0.25 },
    { value: 'economy',       label: 'Economy',         multiplier: 0.50 },
    { value: 'prem_economy',  label: 'Premium Economy', multiplier: 1.00 },
    { value: 'business',      label: 'Business',        multiplier: 1.25 },
    { value: 'first',         label: 'First',           multiplier: 1.50 },
  ],
  award: [
    { value: 'award',         label: 'Atmos Award ticket', multiplier: 1.00 },
  ],
  partner_award: [
    { value: 'partner_award', label: 'Partner Award ticket', multiplier: 0.00 },
  ],
}

export const SP_MINIMUM = 500

export function isAwardBooking(bookingType) {
  return bookingType === 'award' || bookingType === 'partner_award'
}

export function getMultiplier(bookingType, fareOption) {
  if (bookingType === 'award') return 1.0
  if (bookingType === 'partner_award') return 0.0
  const options = FARE_OPTIONS[bookingType] || []
  return options.find(o => o.value === fareOption)?.multiplier ?? 1.0
}

export function calculateFlightPoints({ earningMethod, distanceMiles, ticketPrice, bookingType, fareOption }) {
  const multiplier = getMultiplier(bookingType, fareOption)
  if (multiplier === 0) return 0
  if (earningMethod === 'segment') return SP_MINIMUM
  if (earningMethod === 'spend') return Math.floor((ticketPrice || 0) * 5)

  // Distance method
  const miles = distanceMiles || 0
  const raw = Math.floor(miles * multiplier)
  return Math.max(SP_MINIMUM, raw)
}

export function calculateCardPoints(amount) {
  return Math.floor((amount || 0) / 2)
}

export function calculateCardSpendPoints(activities) {
  const byMonth = {}
  activities.filter(a => a.type === 'card_spend').forEach(a => {
    const month = (a.date || '').slice(0, 7)
    byMonth[month] = (byMonth[month] || 0) + (a.amount || 0)
  })
  const cardSP = Object.values(byMonth).reduce((sum, m) => sum + Math.round(m / 2), 0)
  const bonusSP = activities.filter(a => a.type === 'anniversary_bonus').reduce((sum, a) => sum + (a.statusPoints || 0), 0)
  return cardSP + bonusSP
}

// A projection is a purchase you expect to make (type 'card_projection'). It
// counts as planned on top of real spend until you match it to the synced
// charge, at which point the projection is removed and the charge takes over.
// Sync never matches projections itself.
// An overdue one stops counting: either it posted under a charge that already
// counts, or it never happened. Moving its date or matching it brings it back.
// SP is rounded on the month's total, so a projection's worth is the change it
// makes to its month's rounded total.
export function calculateCardProjectionPoints(activities, today = getToday()) {
  const actual = {}
  const projected = {}
  for (const a of activities) {
    const month = (a.date || '').slice(0, 7)
    if (a.type === 'card_spend') actual[month] = (actual[month] || 0) + (a.amount || 0)
    if (a.type === 'card_projection' && !isProjectionOverdue(a, today)) projected[month] = (projected[month] || 0) + (a.amount || 0)
  }
  return Object.entries(projected).reduce((sum, [month, p]) => {
    const a = actual[month] || 0
    return sum + Math.round((a + p) / 2) - Math.round(a / 2)
  }, 0)
}

// Charges take a few days to post, so a projection gets a week's grace past its date.
const OVERDUE_GRACE_DAYS = 7

const dayDiff = (a, b) => Math.abs(new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000

export function isProjectionOverdue(p, today = getToday()) {
  return (p.date || '') < today && dayDiff(p.date, today) > OVERDUE_GRACE_DAYS
}

// ── Matching projections to real items ──────────────────────────────────────
// Card projections and manual flights share one system: tap a projection to
// pick the real charge or flight it became. Matching removes the projection and
// stores a snapshot of it on the real item (plannedAs), so it can be unmatched.

export const daysBetween = (a, b) => Math.abs(new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000

// Signed day offset of `date` from `from`, for "3 days later" style hints.
export const dayOffset = (date, from) => Math.round((new Date(date + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000)

export function projectionSnapshot(p) {
  const { id, createdAt, ...rest } = p
  return rest
}

const SUGGEST_DAYS = 14

// Charges for a card projection: within two weeks, closest amount first.
export function rankChargeSuggestions({ amount, date }, charges) {
  const gap = t => Math.abs((t.amount || 0) - (amount || 0))
  return charges
    .filter(t => date && daysBetween(t.date, date) <= SUGGEST_DAYS)
    .sort((a, b) => gap(a) - gap(b) || daysBetween(a.date, date) - daysBetween(b.date, date))
    .slice(0, 6)
}

// Synced flights for a manual one: every flight on the same route, any date,
// nearest date first. The route is what defines the trip.
export function rankFlightSuggestions({ origin, destination, date }, flights) {
  return flights
    .filter(f => f.origin === origin && f.destination === destination)
    .sort((a, b) => (date ? daysBetween(a.date, date) - daysBetween(b.date, date) : a.date.localeCompare(b.date)))
}

export function getTierProgress(totalPoints) {
  return TIERS.map(tier => ({
    ...tier,
    progress:  Math.min(100, Math.round((totalPoints / tier.points) * 100)),
    remaining: Math.max(0, tier.points - totalPoints),
    achieved:  totalPoints >= tier.points,
  }))
}

export function getCurrentTier(totalPoints) {
  let current = null
  for (const tier of TIERS) {
    if (totalPoints >= tier.points) current = tier
  }
  return current
}

export function getNextTier(totalPoints) {
  for (const tier of TIERS) {
    if (totalPoints < tier.points) return tier
  }
  return null
}
