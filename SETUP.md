# Atmos Tracker — Setup

## Firebase Setup (one-time, ~5 min)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → New project (name it anything, e.g. `atmos-tracker`)
2. **Authentication** → Get Started → Sign-in method → Enable **Google**
3. **Firestore Database** → Create database → Start in **production mode** → pick a region (us-central1 is fine)
4. **Firestore Rules** — paste this and publish:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
5. **Project Settings** (gear icon) → Your apps → Add app → Web → register it → copy the config values

## Fill in credentials

Open `.env.local` and paste your values:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Run

```bash
npm run dev
```

Open http://localhost:5173 — sign in with Google and start tracking.

## Deploy (optional)

```bash
npm run build
# then deploy dist/ to Firebase Hosting, Vercel, Netlify, etc.
```

---

## How it works

| Feature | Details |
|---|---|
| **Flight SP** | Auto-calculates route distance from IATA codes. Distance method: 1 SP/mi (Alaska), 1.5x domestic partner premium, 2.5x intl partner premium. Saver fares: 0.3x |
| **Card spend** | Summit card: 1 SP per $2 spent |
| **Anniversary bonus** | 10,000 SP — add via Card Spend form |
| **Earning method** | Saved in browser — switch between distance / spend / segment |
| **Tiers** | Silver 20K · Gold 40K · Platinum 80K · Titanium 135K (2026 thresholds) |
| **Paste confirmation** | In the flight form, expand "Paste flight confirmation" and drop in your email text — it'll extract airport codes, date, cabin class, and flight number |
