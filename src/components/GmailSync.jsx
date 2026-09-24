import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { syncFlightsFromGmail } from '../utils/gmailSync'
import Spinner from './Spinner'

function timeAgo(isoString) {
  if (!isoString) return null
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function GmailSync({ uid, accessToken, earningMethod, onAddPending, onFlagCancellation, existingSegmentsByPNR, onCancel, onRefreshToken, userName, lastPoll, onPollComplete }) {
  const [state, setState] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [tokenExpired, setTokenExpired] = useState(false)
  const [progress, setProgress] = useState({ step: '', current: 0, total: 0 })
  const progressRef = useRef({ step: '' })
  const [summary, setSummary] = useState({ added: 0, cancelled: 0, failedBatches: [] })
  const [debugLog, setDebugLog] = useState([])
  const [debugOpen, setDebugOpen] = useState(false)
  const isDev = window.location.hostname === 'localhost'
  const [currentToken, setCurrentToken] = useState(accessToken)
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [keyLoading, setKeyLoading] = useState(true)

  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists() && snap.data().geminiKey) setGeminiKey(snap.data().geminiKey)
      setKeyLoading(false)
    })
  }, [uid])

  const defaultSinceDate = lastPoll
    ? new Date(new Date(lastPoll).getTime() - 86400000).toISOString().slice(0, 10)
    : new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10)
  const [sinceOverride, setSinceOverride] = useState(null)
  const [editingSince, setEditingSince] = useState(false)
  const sinceInputRef = useRef(null)
  const sinceDate = sinceOverride ?? defaultSinceDate

  const [testResult, setTestResult] = useState('')

  async function saveGeminiKey() {
    const key = geminiKeyInput.trim()
    if (!key) return
    await setDoc(doc(db, 'users', uid), { geminiKey: key }, { merge: true })
    setGeminiKey(key)
    setGeminiKeyInput('')
    setTestResult('')
  }

  async function testGeminiKey() {
    const key = (geminiKeyInput.trim() || geminiKey)
    if (!key) return
    setTestResult('Testing…')
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
      )
      const data = await res.json()
      if (!res.ok) {
        setTestResult(`Error: ${data?.error?.message || res.statusText}`)
        return
      }
      const models = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
      setTestResult(models.length ? `Available: ${models.join(', ')}` : 'No generateContent models found')
    } catch (e) {
      setTestResult(`Error: ${e.message}`)
    }
  }

  async function runSync(token) {
    setState('loading')
    setErrorMsg('')
    setTokenExpired(false)

    try {
      const { results, debugLog: log, failedBatches = [] } = await syncFlightsFromGmail(token, geminiKey, {
        earningMethod,
        onProgress: p => { progressRef.current = p; setProgress(p) },
        userName,
        sinceDate,
        existingSegmentsByPNR,
      })
      setDebugLog(log)

      let added = 0, cancelled = 0
      for (const item of results) {
        if (item.type === 'cancellation') {
          const flagged = await onFlagCancellation?.(item.confirmationNumber)
          if (flagged) cancelled++
        } else {
          // Count documents actually written, not results emitted — addPending
          // returns false when a segment is deduplicated away.
          if (await onAddPending(item)) added++
        }
      }

      // Advancing lastPoll past emails Gemini never managed to read would skip them
      // forever on the next sync, so only move the marker on a clean run.
      if (failedBatches.length === 0) {
        await onPollComplete(new Date().toISOString())
      }
      setSummary({ added, cancelled, failedBatches })
      setState('done')
    } catch (err) {
      if (err.message?.includes('401')) {
        setTokenExpired(true)
        setState('error')
      } else {
        const where = progressRef.current.step ? ` (during: ${progressRef.current.step})` : ''
        setErrorMsg(`${err.message || 'Something went wrong.'}${where}`)
        setState('error')
      }
    }
  }

  async function handleReconnect() {
    const newToken = await onRefreshToken?.()
    if (newToken) {
      setCurrentToken(newToken)
      runSync(newToken)
    }
  }

  if (!accessToken) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800">Gmail access required</p>
          <p className="text-xs text-amber-700 mt-1">Click below to reconnect and retry.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button onClick={handleReconnect} className="flex-1 bg-alaska-teal hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-semibold">Reconnect Gmail</button>
        </div>
      </div>
    )
  }

  if (state === 'idle') {
    if (keyLoading) return <div className="py-8 flex justify-center"><Spinner /></div>
    return (
      <div className="space-y-4">
        {!geminiKey ? (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Gemini API key required</p>
              <p>Get a free key at <span className="font-mono">aistudio.google.com</span> → Get API key. No billing needed.</p>
            </div>
            <input
              type="password"
              value={geminiKeyInput}
              onChange={e => setGeminiKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveGeminiKey()}
              placeholder="AIza..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-alaska-blue font-mono"
            />
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={testGeminiKey} disabled={!geminiKeyInput.trim()} className="flex-1 border border-alaska-blue text-alaska-blue py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-alaska-blue/5">
                Test Key
              </button>
              <button onClick={saveGeminiKey} disabled={!geminiKeyInput.trim()} className="flex-1 bg-alaska-teal hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40">
                Save
              </button>
            </div>
            {testResult && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 break-all">{testResult}</p>
            )}
          </div>
        ) : (
          <>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1.5">
              <p className="font-semibold text-slate-800">What this does</p>
              <p>Searches Gmail for new flight emails since your last poll, extracts flight details using Gemini AI, and adds them to your review queue.</p>
              <p className="text-xs text-slate-400">
                {lastPoll ? `Last polled ${timeAgo(lastPoll)}` : 'First poll'} · Searching from{' '}
                {editingSince ? (
                  <input
                    ref={sinceInputRef}
                    type="date"
                    defaultValue={sinceDate}
                    onBlur={e => { setSinceOverride(e.target.value || null); setEditingSince(false) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur() }}
                    className="border-b border-alaska-blue bg-transparent outline-none text-xs text-slate-600 w-30"
                    autoFocus
                  />
                ) : (
                  <span
                    onClick={() => setEditingSince(true)}
                    className="underline decoration-dashed cursor-pointer hover:text-alaska-blue"
                    title="Click to change start date"
                  >
                    {sinceDate}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Gemini key saved</span>
              <div className="flex gap-3">
                <button onClick={testGeminiKey} className="hover:text-alaska-blue">Test key</button>
                <button onClick={async () => { await setDoc(doc(db, 'users', uid), { geminiKey: null }, { merge: true }); setGeminiKey(''); setTestResult('') }} className="hover:text-red-400">Remove</button>
              </div>
            </div>
            {testResult && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 break-all">{testResult}</p>
            )}
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => runSync(currentToken)} className="flex-1 bg-alaska-teal hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                Sync from Gmail
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div className="text-center py-8 space-y-3">
        <Spinner color="teal" className="mx-auto" />
        <p className="text-sm font-medium text-slate-700">{progress.step}</p>
        {progress.total > 0 && (
          <div className="max-w-xs mx-auto">
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className="bg-alaska-teal h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{progress.current} / {progress.total}</p>
          </div>
        )}
      </div>
    )
  }

  if (state === 'error') {
    if (tokenExpired) {
      return (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-800">Gmail access expired</p>
            <p className="text-xs text-amber-700 mt-1">Click below to reconnect and retry.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button onClick={handleReconnect} className="flex-1 bg-alaska-teal hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-semibold">Reconnect Gmail</button>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
        <button onClick={onCancel} className="w-full border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">
          Close
        </button>
      </div>
    )
  }

  if (state === 'done') {
    const dispositionStyle = {
      added:               'bg-green-100 text-green-800',
      cancellation:        'bg-amber-100 text-amber-800',
      cancelled_suppressed:'bg-red-100 text-red-700',
      pnr_dedup:           'bg-slate-100 text-slate-500',
      pnr_merge:           'bg-blue-50 text-blue-600',
      no_segments:         'bg-slate-100 text-slate-500',
      reminder:            'bg-blue-50 text-blue-600',
      reminder_orphan:     'bg-blue-50 text-blue-600',
      flight_dedup:        'bg-slate-100 text-slate-500',
      batch_failed:        'bg-red-100 text-red-700',
    }
    const dispositionLabel = {
      added:               'Added',
      cancellation:        'Cancellation',
      cancelled_suppressed:'Suppressed (cancelled)',
      pnr_dedup:           'Skipped (duplicate PNR)',
      pnr_merge:           'Merged',
      no_segments:         'Skipped (no flights)',
      reminder:            'Skipped (already confirmed)',
      reminder_orphan:     'Skipped (check-in / reminder)',
      flight_dedup:        'Skipped (duplicate flight)',
      batch_failed:        'Not read (Gemini error)',
    }
    return (
      <div className="space-y-4">
        <div className="text-center py-4 space-y-2">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-semibold text-slate-800">{summary.added} flight{summary.added !== 1 ? 's' : ''} added to review queue</p>
          {summary.cancelled > 0 && (
            <p className="text-sm text-amber-600">{summary.cancelled} flagged as possibly cancelled</p>
          )}
          <p className="text-sm text-slate-500">Review and confirm each one on your dashboard</p>
        </div>
        {summary.failedBatches?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">
              {summary.failedBatches.reduce((n, b) => n + b.emailCount, 0)} emails could not be read
            </p>
            <p className="text-xs">
              Gemini failed on {summary.failedBatches.length} of {summary.failedBatches[0].batchTotal} batches.
              Your last-polled date was left unchanged, so running the sync again will retry them.
            </p>
            <p className="text-xs text-amber-700/80 break-words">{summary.failedBatches[0].message}</p>
          </div>
        )}
        {isDev && debugLog.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <button
              onClick={() => setDebugOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100"
            >
              <span>Debug — {debugLog.length} emails processed</span>
              <span>{debugOpen ? '▲' : '▼'}</span>
            </button>
            {debugOpen && (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {debugLog.map((entry, i) => (
                  <div key={i} className="px-3 py-2 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-slate-700 font-medium truncate flex-1" title={entry.subject}>{entry.subject}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${dispositionStyle[entry.disposition] || 'bg-slate-100 text-slate-500'}`}>
                        {dispositionLabel[entry.disposition] || entry.disposition}
                      </span>
                    </div>
                    <div className="text-slate-400 truncate">{entry.from} · {entry.date}{entry.emailKind && entry.emailKind !== 'other' ? ` · ${entry.emailKind}` : ''}{entry.confirmationNumber ? ` · PNR: ${entry.confirmationNumber}` : ''}</div>
                    {entry.detail && <div className="text-slate-500">{entry.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={onCancel} className="w-full bg-alaska-teal text-white px-6 py-2 rounded-xl text-sm font-medium">Done</button>
      </div>
    )
  }

  return null
}
