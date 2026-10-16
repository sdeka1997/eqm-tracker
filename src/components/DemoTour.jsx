import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { getCurrentTier, getNextTier } from '../utils/calculations'

// Guided walkthrough for demo mode. Each step highlights one or more elements
// at once. Steps with `waitFor` advance on their own when the matching counter
// in `events` goes up (the visitor did the thing); there is no skipping them.
// Steps whose `when` is false are passed over, e.g. on a second run of the tour
// once the canned emails have all been imported.

const tour = name => `[data-tour="${name}"]`
const flightRow = f => f && `[data-flight-key="${f.date}|${f.origin}|${f.destination}"]`

const STEPS = [
  {
    title: 'Welcome to Atmos Tracker',
    body: () => 'Alaska\'s site shows the status points that have posted. This shows where you\'ll end up: flights you\'ve booked, card spend, and bonuses all count toward a projected tier. This quick tour takes about a minute.',
    next: 'Start the tour',
  },
  {
    targets: () => [tour('points')],
    title: 'Your status at a glance',
    body: ({ earnedPoints }) => {
      const next = getNextTier(earnedPoints)
      return `You've earned ${earnedPoints.toLocaleString()} status points this year. The solid bar is points already earned; the striped part is trips you've booked but not flown yet.${next ? ` ${next.name} unlocks at ${next.points.toLocaleString()}.` : ''}`
    },
  },
  {
    targets: () => [tour('gmail')],
    title: 'Find flights in Gmail',
    body: () => 'Signed-in users can scan their inbox for airline confirmation emails. Try a simulated scan.',
    waitFor: 'gmailImported',
    hint: 'Click Gmail to continue',
  },
  {
    when: ({ pendingCount }) => pendingCount > 0,
    targets: () => [tour('queue')],
    title: 'Review before it counts',
    body: () => 'Imported flights wait here so nothing counts until you check it. The route, flight number, and fare class were read straight from the email; click "view email" to see the source.',
    waitFor: 'confirmed',
    hint: 'Confirm the flight to continue',
  },
  {
    when: ({ lastConfirmed }) => !!lastConfirmed,
    // Fall back to the whole flights card if the new row's month is collapsed.
    targets: ({ lastConfirmed }) => [tour('points'), [flightRow(lastConfirmed), tour('flights')]],
    title: 'Added, and points updated',
    body: ({ lastConfirmed, earnedPoints, totalPoints }) => {
      const route = `${lastConfirmed.origin} → ${lastConfirmed.destination}`
      const now = getCurrentTier(earnedPoints)
      const planned = getCurrentTier(totalPoints)
      return `${route} is now in your flights (+${lastConfirmed.statusPoints.toLocaleString()} SP), and your planned total rose to ${totalPoints.toLocaleString()}${
        planned && planned !== now ? `, enough for ${planned.name} once you fly it.` : '.'
      }`
    },
  },
  {
    when: ({ flaggedFlight }) => !!flaggedFlight,
    targets: ({ flaggedFlight }) => [[flightRow(flaggedFlight), tour('flights')]],
    title: 'Possible cancellation',
    body: ({ flaggedFlight }) => `The scan also found a cancellation email for ${flaggedFlight.origin} → ${flaggedFlight.destination} (${flaggedFlight.confirmationNumber}). Rather than deleting anything on its own, the app flags the flight for you to decide: Delete it, or Dismiss the flag if the trip is still on.`,
    waitFor: 'cancellationResolved',
    hint: 'Delete or dismiss to continue',
  },
  {
    targets: () => [tour('flights')],
    title: 'Every flight, scored',
    body: () => 'Flights are grouped by month (click a month to expand it). Click any flight to change its fare class and see the points recalculate under Alaska\'s earning rules; tap ✈️ to stop counting a flight.',
  },
  {
    targets: () => [tour('card')],
    title: 'Credit card spend',
    body: () => 'Card spend earns 1 status point per $2, totaled by month. Signed-in users link their card through Plaid; try a simulated sync to pull in new transactions.',
    waitFor: 'cardSynced',
    hint: 'Click Sync to continue',
  },
  {
    targets: () => [tour('points'), tour('card')],
    title: "That's the tour",
    body: ({ lastCardSync, totalPoints }) => `${
      lastCardSync?.count
        ? `${lastCardSync.count} new transactions landed in this month's card spend (+${lastCardSync.points.toLocaleString()} SP), bringing you to ${totalPoints.toLocaleString()} with planned trips. `
        : ''
    }Keep exploring and change anything you like. Nothing here is saved.`,
    final: true,
  },
]

const PAD = 6
const GUTTER = 16
const GAP = 12

// Some sections render twice (mobile and desktop layouts); use the visible one.
function findVisible(selector) {
  if (!selector) return null
  return [...document.querySelectorAll(selector)].find(el => el.getBoundingClientRect().width > 0) || null
}

// Each target is a selector, or a list of fallbacks where the first match wins.
function resolveTargets(step, context) {
  if (!step.targets) return []
  return step.targets(context)
    .map(t => (Array.isArray(t) ? t : [t]).map(findVisible).find(Boolean))
    .filter(Boolean)
}

function toRect(el) {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function union(rects) {
  const top = Math.min(...rects.map(r => r.top))
  const left = Math.min(...rects.map(r => r.left))
  const bottom = Math.max(...rects.map(r => r.top + r.height))
  const right = Math.max(...rects.map(r => r.left + r.width))
  return { top, left, width: right - left, height: bottom - top }
}

// Scroll so every target is on screen together when they fit, else the first.
function scrollToTargets(els) {
  if (!els.length) return
  const u = union(els.map(toRect))
  const vh = window.innerHeight
  const top = u.height < vh - 2 * GUTTER - 160
    ? window.scrollY + u.top - (vh - u.height) / 2
    : window.scrollY + u.top - 80
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

function placePopover(area, size, width) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!area) return { top: Math.max(GUTTER, (vh - size.height) / 2), left: (vw - width) / 2 }

  const clampTop = t => Math.min(Math.max(GUTTER, t), vh - GUTTER - size.height)
  const clampLeft = l => Math.min(Math.max(GUTTER, l), vw - GUTTER - width)
  const centeredLeft = clampLeft(area.left + area.width / 2 - width / 2)

  const below = area.top + area.height + PAD + GAP
  if (below + size.height <= vh - GUTTER) return { top: below, left: centeredLeft }
  const above = area.top - PAD - GAP - size.height
  if (above >= GUTTER) return { top: above, left: centeredLeft }
  const right = area.left + area.width + PAD + GAP
  if (right + width <= vw - GUTTER) return { top: clampTop(area.top), left: right }
  const left = area.left - PAD - GAP - width
  if (left >= GUTTER) return { top: clampTop(area.top), left }
  return { top: vh - GUTTER - size.height, left: centeredLeft }
}

export default function DemoTour({ events, context, onClose }) {
  const [index, setIndex] = useState(0)
  const [rects, setRects] = useState([])
  // Step aside while any modal is open (editing a flight, the Gmail scan, …).
  const [paused, setPaused] = useState(false)
  const [popSize, setPopSize] = useState({ width: 0, height: 0 })
  const popRef = useRef(null)
  const baseline = useRef(null)
  const contextRef = useRef(context)
  contextRef.current = context
  const step = STEPS[index]

  function advance() {
    let i = index + 1
    while (i < STEPS.length - 1 && STEPS[i].when && !STEPS[i].when(contextRef.current)) i++
    setIndex(i)
  }

  // Remember the event count when a waiting step starts; advance when it grows.
  useEffect(() => {
    baseline.current = step.waitFor ? events[step.waitFor] : null
  }, [index])

  useEffect(() => {
    if (step.waitFor && events[step.waitFor] > baseline.current) advance()
  }, [events, step])

  // Bring the targets into view when the step changes. Wait a frame so layout
  // changes from the triggering action (a queue card disappearing) settle first.
  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToTargets(resolveTargets(step, contextRef.current)))
    return () => cancelAnimationFrame(frame)
  }, [index])

  // Follow the targets as the page scrolls, resizes, or re-renders.
  useEffect(() => {
    let frame
    const tick = () => {
      setPaused(!!document.querySelector('[data-modal]'))
      const next = resolveTargets(step, contextRef.current).map(toRect)
      setRects(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [step])

  useLayoutEffect(() => {
    if (!popRef.current) return
    const { offsetWidth: width, offsetHeight: height } = popRef.current
    if (width !== popSize.width || height !== popSize.height) setPopSize({ width, height })
  })

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !paused) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused, onClose])

  if (paused) return null

  const width = Math.min(340, window.innerWidth - GUTTER * 2)
  const pop = placePopover(rects.length ? union(rects) : null, popSize, width)
  const stepCount = STEPS.length - 1 // the welcome card isn't numbered

  return (
    <>
      {/* Dim everything except the targets; clicks pass through to the page. */}
      <svg className="fixed inset-0 z-[60] w-full h-full pointer-events-none">
        <defs>
          <mask id="demo-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rects.map((r, i) => (
              <rect key={i} x={r.left - PAD} y={r.top - PAD} width={r.width + PAD * 2} height={r.height + PAD * 2} rx="16" fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.55)" mask="url(#demo-tour-mask)" />
      </svg>
      {rects.map((r, i) => (
        <div
          key={i}
          className="fixed z-[60] rounded-2xl pointer-events-none ring-2 ring-alaska-teal transition-all duration-200"
          style={{ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }}
        />
      ))}
      {!step.targets && <div className="fixed inset-0 z-[60]" />}

      <div
        ref={popRef}
        role="dialog"
        aria-label={step.title}
        className="fixed z-[61] bg-white rounded-2xl shadow-2xl p-4 transition-[top,left] duration-200"
        style={{ ...pop, width }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-slate-800">{step.title}</h3>
          {index > 0 && (
            <span className="text-xs text-slate-400 shrink-0 mt-0.5">{index} / {stepCount}</span>
          )}
        </div>
        <p className="text-sm text-slate-600 mt-1.5">{step.body(context)}</p>

        <div className="flex items-center justify-between gap-3 mt-4">
          {step.final ? <span /> : (
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">Exit tour</button>
          )}
          {step.final ? (
            <button
              onClick={onClose}
              className="bg-alaska-blue hover:bg-alaska-navy text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Finish
            </button>
          ) : step.waitFor ? (
            <span className="text-xs font-medium text-alaska-blue animate-pulse">{step.hint}</span>
          ) : (
            <button
              onClick={advance}
              className="bg-alaska-blue hover:bg-alaska-navy text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              {step.next || 'Next'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
