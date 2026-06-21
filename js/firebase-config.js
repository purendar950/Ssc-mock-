/* ===========================================================
   ExamZen - Firebase configuration
   -----------------------------------------------------------
   Fill in the values from your Firebase console to enable the
   real backend. While these remain placeholders, the app runs
   in LOCAL MODE (auth + data persisted in the browser via
   localStorage) so you can develop and demo without a backend.

   Firebase API keys are MEANT to be public in client code;
   security is enforced by Firestore Security Rules, not by
   hiding the key. See README for the recommended rules.
   =========================================================== */

window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Auto-detect whether real Firebase config has been provided.
window.FIREBASE_ENABLED =
  window.FIREBASE_CONFIG.apiKey &&
  window.FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";
