# Atmos Tracker

Tracks progress toward Alaska **Atmos Rewards** elite status by pulling the two things that
actually earn status points — flights and credit-card spend — out of the places they already
live, instead of asking you to type them in.

Status points are awarded on a different basis depending on how a ticket was booked, so a
flight's value isn't something you can eyeball. This app models that properly.

## What it does

**Earns are calculated, not guessed.** Three earning methods (distance, spend at 5 SP/$1, or
500 SP/segment) across six booking contexts — Alaska/Horizon/Hawaiian direct, Hawaiian direct,
partner via Alaska, partner direct, and both award types — each with its own fare-class
multiplier table (Saver 0.30× through First J 2.00×).

**Flights arrive on their own.**

- **Gmail sync** scans confirmation mail, groups segments by PNR, and detects cancellations
  against what you've already logged.
- **Flighty import** brings in an existing flight history.
- **Plaid** syncs card transactions for spend-based earning, including anniversary bonuses.

**Anything ambiguous goes to a review queue** rather than silently landing in your totals — the
parsers propose, you confirm.

**Tier progress** shows earned vs. planned points against all four thresholds (Silver 20,000 ·
Gold 40,000 · Platinum 80,000 · Titanium 135,000) with the oneworld equivalent for each.

## Built with

React + Vite · Firebase Auth (Google) · Firestore · Cloud Functions v2 · Plaid · Gmail API ·
Tailwind

Data is per-user and scoped by Firestore rules to the signed-in UID. Plaid credentials live in
Cloud Functions secrets and never reach the client: Link hands back a short-lived `public_token`
that's exchanged server-side for the durable `access_token`, so connecting an account is a
three-call flow rather than one.

## Running it

See [`SETUP.md`](SETUP.md) for the Firebase project, Firestore rules, and OAuth setup. Then:

```bash
cp .env.example .env.local   # fill in your Firebase web config
npm install
npm run dev
```

Cloud Functions (Plaid) deploy separately from `functions/`.
