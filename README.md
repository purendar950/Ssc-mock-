# ExamZen — Mock Test Platform

A static, framework-free exam-preparation platform for Indian government exams
(SSC CGL/CHSL, Railway NTPC, and more). Built with **vanilla HTML + CSS + JavaScript**,
designed to be hosted for free on **Cloudflare Pages / GitHub Pages** with an optional
**Firebase** backend.

It runs out of the box in **Local Mode** (auth + results stored in the browser via
`localStorage`), so you can develop and demo with zero setup. Add your Firebase config
to switch to a real backend.

## ✨ Features

- 🔐 Username/email + password auth (Local Mode now, Firebase-ready)
- 📚 Exam hub with **Full Mock / Sectional / Subject-wise / PYQ** tabs
- 🧪 Full CBT-style **test engine**: timer with auto-submit, question palette with
  color states, mark-for-review, clear response, section navigation, resume support
- 🌐 **Bilingual** questions (English / हिन्दी / both)
- 📊 **Results** with score, section-wise breakdown, accuracy, time, All-India rank
- ✅ Per-question **solutions** with explanations and save-to-library
- 🔖 **Saved questions** page with List/Focus views and language toggle
- 💳 Manual **UPI premium** flow with coupon/referral support
- 🔴 **Live tests** page (Live Now / Previous Live)
- 🌙 Dark mode • 📱 Installable **PWA** with offline caching

## 🚀 Run locally

This is a static site, but it must be served over HTTP (not opened as `file://`)
because it uses `fetch()` for the question JSON.

```bash
# from the repo root
python3 -m http.server 8080
# then open http://localhost:8080
```

Try the flow: **Register → Exams → SSC CGL → Start "Full Mock 1" → answer → Submit →
view results & solutions → save a question → Saved page.**

## 📁 Structure

```
examzen/
├── index.html              Homepage
├── login.html              Login / Register
├── profile.html            User dashboard + result history
├── pricing.html            Plans
├── buy-premium.html        UPI payment + coupon
├── saved.html              Saved questions (list/focus, language modes)
├── exams/
│   ├── index.html          Exam hub
│   └── portal.html         Exam portal (?exam=ID) with tabs
├── test/index.html         Test engine host
├── result/index.html       Results + solutions
├── live-test/index.html    Live tests
├── data/
│   ├── catalog.json        Exam + test catalog
│   └── *.json              One file per test (question bank)
├── css/{style,test}.css
├── js/{utils,auth,firebase-config,test-engine}.js
├── manifest.json, sw.js    PWA
└── icon-192.png, icon-512.png, logo.png
```

## 🧩 Adding a test

1. Create `data/<your-test-id>.json` using the schema below.
2. Add an entry under the right exam/tab in `data/catalog.json`:
   ```json
   { "testId": "<your-test-id>", "name": "Display Name",
     "questions": 100, "marks": 200, "durationMin": 60, "premium": false }
   ```

### Test JSON schema

```json
{
  "testId": "cgl-full-mock-01",
  "testName": "SSC CGL Tier-I Full Mock 1",
  "examType": "CGL",
  "duration": 600,                 // seconds
  "totalQuestions": 8,
  "totalMarks": 16,
  "marksPerQuestion": 2,
  "negativeMarking": 0.5,
  "isPremium": false,
  "sections": [
    {
      "sectionId": "reasoning",
      "sectionName": "General Intelligence & Reasoning",
      "questions": [
        {
          "en": "Question text",
          "hi": "प्रश्न",
          "options": {
            "A": { "en": "...", "hi": "..." },
            "B": { "en": "...", "hi": "..." },
            "C": { "en": "...", "hi": "..." },
            "D": { "en": "...", "hi": "..." }
          },
          "correct": "A",
          "explanation": { "en": "...", "hi": "..." },
          "topic": "Blood Relations",
          "subject": "Reasoning",
          "difficulty": "easy"
        }
      ]
    }
  ]
}
```

## 🔌 Going live with Firebase

1. Create a Firebase project; enable **Authentication (Email/Password)**,
   **Firestore**, and **Storage**.
2. Put your config in `js/firebase-config.js` (the `FIREBASE_ENABLED` flag flips
   automatically once `apiKey` is a real value). The API key is meant to be public —
   security is enforced by Firestore Rules.
3. Re-implement the internals of `EZAuth` (in `js/auth.js`) using Firebase Auth +
   a Firestore `users` collection, and swap the `localStorage` reads/writes in the
   pages (`ez_results`, `ez_saved_*`, `ez_payment_requests`) for Firestore collections.
   The public `EZAuth` API is intentionally stable so page code does not change.

### Suggested Firestore collections
`users`, `testResults`, `savedQuestions`, `paymentRequests`, `partners`, `liveTests`.

### Suggested Firestore rules (starting point)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /testResults/{id} {
      allow create: if request.auth != null;
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    match /savedQuestions/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /paymentRequests/{id} {
      allow create: if request.auth != null;
    }
    match /partners/{code}  { allow read: if true; }
    match /liveTests/{id}   { allow read: if true; }
  }
}
```

## 📦 Deploy

- **Cloudflare Pages / GitHub Pages / Netlify**: point it at this repo root.
  No build step — it's pure static files.

## ⚠️ Notes

- Local Mode passwords are stored in plain text in the browser **for demo only**.
  Real auth must use Firebase Auth (or another provider) which handles hashing.
- The All-India rank in Local Mode is computed from attempts stored on the same
  device. With Firebase, query `testResults` ordered by score.


---

## 🧑‍💼 Admin, Partner & Monetization (added)

The platform now includes a full manual-UPI monetization flow:

- **`buy-premium.html`** — apply a coupon (`WELCOME` or any active partner code, or a
  `?ref=CODE` referral link), pay via UPI, and submit the UTR. The request is saved as
  **pending**.
- **`admin-vault.html`** — admin panel (gated by `isAdmin` or username `admin`; in demo
  mode there's a one-click "Enable admin access" button). Manage:
  - **Buy Requests** — approve (grants the buyer Premium for 365 days and credits the
    partner) or reject.
  - **Partner Requests** — approve applications (creates a partner + coupon code).
  - **Payouts** — mark partner payout requests paid.
  - **Ledger** — per-partner sales/earnings/withdrawals.
- **`apply-coupon.html`** — users apply to become partners.
- **`partner-dashboard.html`** — partners see sales, earnings, referral link, and can
  request payouts (min ₹100). Partners earn **80% of the discount** per sale.

Plus **legal pages** (about, contact, privacy, refund, terms) and a **Series** hub
(`series/index.html` + `series/portal.html?series=ID`, data in `data/series.json`),
all linked from a site-wide footer.

### End-to-end demo flow
1. Register as user **A**, go to **Buy Premium**, submit a payment (try coupon `WELCOME`).
2. Go to **Admin Vault** → *Enable admin access* → **Buy Requests** → Approve. User A is now Premium.
3. Register/log in as user **B**, **Apply to become a Partner** with code e.g. `REX10`.
4. As admin, approve the partner request. Share `buy-premium.html?ref=REX10`.
5. A new buyer using `REX10` → admin approves → partner B's dashboard shows the sale & earnings.

## 🚀 Deployment (GitHub Pages via Actions)

`.github/workflows/deploy.yml` deploys the site to GitHub Pages on every push to `main`.
It uses `actions/configure-pages` with `enablement: true`, so Pages is enabled
automatically (no manual settings toggle needed) on the first successful run.

After the workflow completes, the site is live at:
`https://<owner>.github.io/<repo>/`

`.nojekyll` is included so all files are served as-is.


---

## 🔑 Supabase authentication (optional, recommended for production)

The app ships in **Local Mode** (browser-only auth) and flips to **Supabase Mode**
automatically once you provide real credentials. Auth state drives premium/admin/partner
access across the whole UI via the `profiles` table.

### Setup (4 steps)
1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query →** paste & run [`supabase/schema.sql`](supabase/schema.sql).
   This creates the `profiles` table, a trigger that auto-creates a profile on signup,
   RLS policies, and the username-login RPCs.
3. **Project Settings → API**: copy the **Project URL** and **anon public** key into
   `js/firebase-config.js`:
   ```js
   window.SUPABASE_URL = "https://YOURREF.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
4. (Optional) **Authentication → Providers → Email**: turn **Confirm email** off for
   instant login during testing, or leave it on (users confirm via email before first login).

### Make yourself admin
After registering once, run in the SQL editor:
```sql
update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
```

### How it maps
| App concept            | profiles column            |
|------------------------|----------------------------|
| `plan: "premium"`      | `is_paid` + `expires_at`   |
| `isAdmin`              | `role = 'admin'`           |
| `isPartner`            | `is_partner`               |
| username login         | `email_for_username()` RPC |

The `EZAuth` API (`currentUser`, `isPremium`, `login`, `register`, `updateUser`,
`grantPremium`, `logout`, `requireLogin`) is identical in both modes —
`currentUser()`/`isPremium()` stay synchronous (backed by a cached profile that Supabase
hydrates), so no page code changes between modes. Await `EZAuth.ready` for the initial
session restore.

> **Scope note:** This integration covers **auth + profile-driven access**. The payment
> requests and partner ledger (`js/store.js`) still use local storage; moving those into
> Supabase tables (with an edge function to flip `is_paid` on admin approval) is the
> natural next step. RLS already prevents non-admins from changing `is_paid`/`role`, so
> the in-app "claim admin" button only works in Local Mode by design.
