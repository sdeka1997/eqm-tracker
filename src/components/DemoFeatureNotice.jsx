const FEATURES = {
  calendar: {
    title: 'Gmail sync',
    body: 'Signed-in users connect Gmail with read-only access. The app finds airline confirmation emails, pulls out each flight leg, fare class and confirmation code, then queues them for review.',
    tryIt: 'The review queue already holds a flight found this way. Open "view email" on it to see the source.',
  },
  plaid: {
    title: 'Card sync',
    body: 'Signed-in users link their Atmos credit card through Plaid. New transactions are pulled in automatically and turned into Status Points at 1 SP per $2, rounded per month.',
    tryIt: 'The card spend in this demo is sample data shaped like a real sync.',
  },
}

export default function DemoFeatureNotice({ feature, onClose }) {
  const f = FEATURES[feature]
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{f.body}</p>
      <p className="text-sm text-slate-600">{f.tryIt}</p>
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
        {f.title} is turned off in demo mode because it connects to a real account.
      </p>
      <button
        onClick={onClose}
        className="w-full bg-alaska-blue hover:bg-alaska-navy text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
      >
        Got it
      </button>
    </div>
  )
}
