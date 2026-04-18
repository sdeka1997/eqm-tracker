import { TIERS, getCurrentTier, getNextTier } from '../utils/calculations'

const MAX_POINTS = TIERS[TIERS.length - 1].points // 135,000

const TIER_ZONE_COLORS = [
  { bg: 'bg-slate-200',   solid: 'bg-slate-400',   label: 'text-slate-500' },   // Silver
  { bg: 'bg-yellow-100',  solid: 'bg-yellow-400',  label: 'text-yellow-600' },  // Gold
  { bg: 'bg-sky-100',     solid: 'bg-sky-300',     label: 'text-sky-600' },     // Platinum
  { bg: 'bg-purple-100',  solid: 'bg-purple-400',  label: 'text-purple-600' },  // Titanium
]

function hexToRgba(hex, alpha) {
  const [r, g, b] = hex.match(/\w\w/g).map(x => parseInt(x, 16))
  return `rgba(${r},${g},${b},${alpha})`
}

const TIER_BAR_COLORS = {
  null:     { solid: '#166534', stripeB: 'rgba(134,239,172,0.5)' },
  Silver:   { solid: '#64748b', stripeB: 'rgba(226,232,240,0.6)' },
  Gold:     { solid: '#a16207', stripeB: 'rgba(253,230,138,0.5)' },
  Platinum: { solid: '#1e40af', stripeB: 'rgba(147,197,253,0.5)' },
  Titanium: { solid: '#6b21a8', stripeB: 'rgba(216,180,254,0.5)' },
}

function pct(points) {
  return Math.min(100, (points / MAX_POINTS) * 100)
}

function zonePct(start, end) {
  return ((end - start) / MAX_POINTS) * 100
}

export default function TierProgress({ earnedPoints, plannedPoints }) {
  const totalPoints = earnedPoints + plannedPoints
  const currentTier = getCurrentTier(earnedPoints)
  const nextTier = getNextTier(earnedPoints)
  const barColors = TIER_BAR_COLORS[currentTier?.name ?? null]

  // Zone boundaries: [start, end]
  const zones = [
    [0,      TIERS[0].points],
    [TIERS[0].points, TIERS[1].points],
    [TIERS[1].points, TIERS[2].points],
    [TIERS[2].points, TIERS[3].points],
  ]

  return (
    <div className="space-y-3">
      {/* Tier labels above */}
      <div className="relative h-4">
        {TIERS.map((tier, i) => (
          <span
            key={tier.name}
            className={`absolute text-xs font-medium ${TIER_ZONE_COLORS[i].label} ${i === TIERS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${pct(tier.points)}%` }}
          >
            {tier.name}
          </span>
        ))}
      </div>

      {/* Bar */}
      <div className="relative w-full h-4 rounded-full overflow-hidden flex">
        {/* Colored tier zone backgrounds */}
        {zones.map(([start, end], i) => (
          <div
            key={i}
            className={`h-full ${TIER_ZONE_COLORS[i].bg}`}
            style={{ width: `${zonePct(start, end)}%` }}
          />
        ))}

        {/* Planned overlay — diagonal stripes */}
        {plannedPoints > 0 && (
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${pct(totalPoints)}%`,
              background: `repeating-linear-gradient(45deg, ${hexToRgba(barColors.solid, 0.8)} 0px, ${hexToRgba(barColors.solid, 0.8)} 4px, ${barColors.stripeB} 4px, ${barColors.stripeB} 8px)`,
              boxShadow: `inset 0 0 0 1.5px ${hexToRgba(barColors.solid, 0.7)}`,
            }}
          />
        )}

        {/* Earned fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct(earnedPoints)}%`, background: barColors.solid }}
        />

        {/* Tier dividers */}
        {TIERS.map(tier => (
          <div
            key={tier.name}
            className="absolute top-0 h-full w-px bg-white/70"
            style={{ left: `${pct(tier.points)}%` }}
          />
        ))}
      </div>

      {/* SP labels below thresholds */}
      <div className="relative h-4">
        {TIERS.map((tier, i) => (
          <span
            key={tier.name}
            className={`absolute text-xs ${TIER_ZONE_COLORS[i].label} opacity-60 ${i === TIERS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${pct(tier.points)}%` }}
          >
            {(tier.points / 1000).toFixed(0)}k
          </span>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm pt-1">
        <div>
          <span className="font-bold text-slate-800">{earnedPoints.toLocaleString()}</span>
          <span className="text-slate-400 ml-1">SP earned</span>
          {plannedPoints > 0 && (
            <span className="text-slate-400 ml-2">
              · <span className="text-slate-500">{totalPoints.toLocaleString()}</span> with planned
            </span>
          )}
        </div>
        <div className="text-right">
          {nextTier ? (
            <span className="text-slate-400 text-xs">
              {(nextTier.points - earnedPoints).toLocaleString()} SP to {nextTier.name}
            </span>
          ) : (
            <span className="text-xs text-purple-600 font-medium">Titanium achieved ✓</span>
          )}
        </div>
      </div>
    </div>
  )
}
