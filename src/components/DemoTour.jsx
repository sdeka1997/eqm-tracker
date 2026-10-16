import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { getCurrentTier, getNextTier } from '../utils/calculations'

// Guided walkthrough for demo mode. Each step highlights an element tagged
// with data-tour="<target>". Steps with `waitFor` advance on their own when
// the matching counter in `events` goes up (the user did the thing).

const STEPS = [
  {
    title: 'Welcome to Atmos Tracker',
    body: () => 'This app tracks Alaska Airlines Atmos Rewards status points across flights, credit card spend, and bonuses, then shows how close you are to the next tier. This quick tour takes about a minute.',
    next: 'Start the tour',
  },
  {
    target: 'points',
    title: 'Your status at a glance',
    body: ({ earnedPoints }) => {
      const next = getNextTier(earnedPoints)
      return `You've earned ${earnedPoints.toLocaleString()} status points this year. The solid bar is points already earned; the striped part is trips you've booked but not flown yet.${next ? ` ${next.name} unlocks at ${next.points.toLocaleString()}.` : ''}`
    },
  },
  {
    target: 'queue',
    title: 'Review imported flights',
    body: () => 'Flights found in Gmail or a Flighty export land here first, so nothing counts until you check it. This one came from a confirmation email; the fare class was read straight from it. Click Confirm ✓ to add it.',
    waitFor: 'confirmed',
  },
  {
    target: 'points',
    title: 'Points update instantly',
    body: ({ earnedPoints, totalPoints }) => {
      const now = getCurrentTier(earnedPoints)
      const planned = getCurrentTier(totalPoints)
      return planned && planned !== now
        ? `With that flight booked, your planned total is ${totalPoints.toLocaleString()}, enough for ${planned.name} once you fly it.`
        : `Your planned total is now ${totalPoints.toLocaleString()} status points.`
    },
  },
  {
    target: 'flights',
    title: 'Every flight, scored',
    body: () => 'Flights are grouped by month (click a month to expand it). Click any flight to change its fare class and see the points recalculate under Alaska\'s earning rules; tap ✈️ to stop counting a flight.',
  },
  {
    target: 'card',
    title: 'Credit card spend',
    body: () => 'Card transactions sync automatically and earn 1 status point per $2, totaled by month. Click a month to see the transactions in it.',
  },
  {
    target: 'gmail',
    title: 'Find flights in Gmail',
    body: () => 'Signed-in users can scan their inbox for airline confirmation emails. Click Gmail to try a simulated scan.',
    waitFor: 'gmailImported',
  },
  {
    target: 'queue',
    title: "That's the tour",
    body: ({ gmailImported }) => `${gmailImported ? 'The scan found a new booking and queued it for review, just like the real thing. ' : ''}Keep exploring: add, edit, or delete anything. Nothing here is saved.`,
    final: true,
  },
]

const PAD = 6
const GUTTER = 16
const GAP = 12

function findTarget(name) {
  if (!name) return null
  // Some sections render twice (mobile and desktop layouts); use the visible one.
  return [...document.querySelectorAll(`[data-tour="${name}"]`)]
    .find(el => el.getBoundingClientRect().width > 0) || null
}

function sameRect(a, b) {
  return a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

export default function DemoTour({ events, context, onClose, onSignIn }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  // Step aside while any modal is open (editing a flight, the Gmail scan, …).
  const [paused, setPaused] = useState(false)
  const [popSize, setPopSize] = useState({ width: 0, height: 0 })
  const popRef = useRef(null)
  const baseline = useRef(null)
  const step = STEPS[index]

  // Remember the event count when a waiting step starts; advance when it grows.
  useEffect(() => {
    baseline.current = step.waitFor ? events[step.waitFor] : null
  }, [index])

  useEffect(() => {
    if (step.waitFor && events[step.waitFor] > baseline.current) {
      setIndex(i => i + 1)
    }
  }, [events, step])

  // Bring the target into view when the step changes.
  useEffect(() => {
    findTarget(step.target)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [index])

  // Follow the target as the page scrolls, resizes, or re-renders.
  useEffect(() => {
    let frame
    const tick = () => {
      setPaused(!!document.querySelector('[data-modal]'))
      const el = findTarget(step.target)
      const r = el?.getBoundingClientRect()
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      setRect(prev => (sameRect(prev, next) || (!prev && !next) ? prev : next))
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

  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(340, vw - GUTTER * 2)

  let popStyle
  if (step.target && rect) {
    const below = rect.top + rect.height + PAD + GAP
    const above = rect.top - PAD - GAP - popSize.height
    const fitsBelow = below + popSize.height <= vh - GUTTER
    const top = fitsBelow || above < GUTTER ? Math.min(below, vh - GUTTER - popSize.height) : above
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, GUTTER), vw - GUTTER - width)
    popStyle = { top: Math.max(GUTTER, top), left, width }
  } else {
    popStyle = { top: Math.max(GUTTER, (vh - popSize.height) / 2), left: (vw - width) / 2, width }
  }

  const spotlight = step.target && rect
  const stepCount = STEPS.length - 1 // the welcome card isn't numbered

  return (
    <>
      {spotlight ? (
        <div
          className="fixed z-[60] rounded-2xl pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[60] bg-slate-900/55" onClick={onClose} />
      )}

      <div
        ref={popRef}
        role="dialog"
        aria-label={step.title}
        className="fixed z-[61] bg-white rounded-2xl shadow-2xl p-4 transition-[top,left] duration-200"
        style={popStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-slate-800">{step.title}</h3>
          {index > 0 && (
            <span className="text-xs text-slate-400 shrink-0 mt-0.5">{index} / {stepCount}</span>
          )}
        </div>
        <p className="text-sm text-slate-600 mt-1.5">{step.body(context)}</p>

        <div className="flex items-center justify-between gap-3 mt-4">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
            {step.final ? 'Close' : 'Skip tour'}
          </button>
          <div className="flex items-center gap-2">
            {index > 1 && !step.final && (
              <button
                onClick={() => setIndex(i => i - 1)}
                className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5"
              >
                Back
              </button>
            )}
            {step.final ? (
              <button
                onClick={onSignIn}
                className="bg-alaska-blue hover:bg-alaska-navy text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign in with Google
              </button>
            ) : step.waitFor ? (
              <button
                onClick={() => setIndex(i => i + 1)}
                className="text-sm text-slate-400 hover:text-slate-600 px-2 py-1.5"
              >
                Skip step
              </button>
            ) : (
              <button
                onClick={() => setIndex(i => i + 1)}
                className="bg-alaska-blue hover:bg-alaska-navy text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                {step.next || 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
