const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export const isFlight = (a) => a.type === 'flight'
export const isCardItem = (a) => a.type === 'card_spend' || a.type === 'anniversary_bonus'
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
  award:              'Award',
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
  { value: 'award',              label: 'Award' },
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
    { value: 'award',         label: 'Award ticket',    multiplier: 1.00 },
  ],
}

export const SP_MINIMUM = 500

export function getMultiplier(bookingType, fareOption) {
  if (bookingType === 'award') return 1.0
  const options = FARE_OPTIONS[bookingType] || []
  return options.find(o => o.value === fareOption)?.multiplier ?? 1.0
}

export function calculateFlightPoints({ earningMethod, distanceMiles, ticketPrice, bookingType, fareOption }) {
  if (earningMethod === 'segment') return SP_MINIMUM
  if (earningMethod === 'spend') return Math.floor((ticketPrice || 0) * 5)

  // Distance method
  const miles = distanceMiles || 0
  const multiplier = getMultiplier(bookingType, fareOption)
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
