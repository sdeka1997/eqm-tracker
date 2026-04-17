import { useState, useRef } from 'react'
import { syncFlightsFromGmail } from '../utils/gmailSync'
import Spinner from './Spinner'

const GEMINI_KEY_STORAGE = 'gemini_api_key'

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

export default function GmailSync({ accessToken, earningMethod, onAddPending, onCancel, onRefreshToken, userName, lastPoll, onPollComplete }) {
  const [state, setState] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [tokenExpired, setTokenExpired] = useState(false)
  const [progress, setProgress] = useState({ step: '', current: 0, total: 0 })
  const [summary, setSummary] = useState({ added: 0, cancelled: 0 })
  const [currentToken, setCurrentToken] = useState(accessToken)
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || '')
  const [geminiKeyInput, setGeminiKeyInput] = useState('')

  const defaultSinceDate = lastPoll
    ? new Date(new Date(lastPoll).getTime() - 86400000).toISOString().slice(0, 10)
    : new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10)
  const [sinceOverride, setSinceOverride] = useState(null)
  const [editingSince, setEditingSince] = useState(false)
  const sinceInputRef = useRef(null)
  const sinceDate = sinceOverride ?? defaultSinceDate

  const [testResult, setTestResult] = useState('')

  function saveGeminiKey() {
    const key = geminiKeyInput.trim()
    if (!key) return
    localStorage.setItem(GEMINI_KEY_STORAGE, key)
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
      const flights = await syncFlightsFromGmail(token, geminiKey, {
        earningMethod,
        onProgress: p => setProgress(p),
        userName,
        sinceDate,
      })

      let added = 0, cancelled = 0
      for (const flight of flights) {
        await onAddPending(flight)
        flight.cancelled ? cancelled++ : added++
      }

      const now = new Date().toISOString()
      await onPollComplete(now)
      setSummary({ added: added + cancelled, cancelled })
      setState('done')
    } catch (err) {
      if (err.message?.includes('401')) {
        setTokenExpired(true)
        setState('error')
      } else {
        setErrorMsg(err.message || 'Something went wrong.')
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
      <div className="text-center py-6 space-y-3">
        <p className="text-sm text-slate-600">Sign out and back in to grant Gmail access.</p>
        <button onClick={onCancel} className="text-alaska-blue text-sm hover:underline">Cancel</button>
      </div>
    )
  }

  if (state === 'idle') {
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
              autoFocus
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
                <button onClick={() => { localStorage.removeItem(GEMINI_KEY_STORAGE); setGeminiKey(''); setTestResult('') }} className="hover:text-red-400">Remove</button>
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
    return (
      <div className="text-center py-6 space-y-2">
        <div className="text-4xl mb-3">📋</div>
        <p className="font-semibold text-slate-800">{summary.added} flight{summary.added !== 1 ? 's' : ''} added to review queue</p>
        {summary.cancelled > 0 && (
          <p className="text-sm text-amber-600">{summary.cancelled} flagged as possibly cancelled</p>
        )}
        <p className="text-sm text-slate-500 mb-4">Review and confirm each one on your dashboard</p>
        <button onClick={onCancel} className="bg-alaska-teal text-white px-6 py-2 rounded-xl text-sm font-medium">Done</button>
      </div>
    )
  }

  return null
}
