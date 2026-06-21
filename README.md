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
