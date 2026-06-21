/* ===========================================================
   ExamZen - Backend configuration
   -----------------------------------------------------------
   PASTE YOUR SUPABASE PROJECT VALUES BELOW to switch the app
   from LOCAL MODE (browser-only auth) to your real Supabase
   backend. Get them in: Supabase Dashboard -> Project Settings
   -> API -> "Project URL" and "anon public" key.

   The anon key is meant to be public in client code; security
   is enforced by Row Level Security (RLS) policies, not by
   hiding the key. The required SQL is in /supabase/schema.sql.

   While these stay as placeholders, the app keeps running in
   LOCAL MODE so you can demo without any backend.
   =========================================================== */

window.SUPABASE_URL = "YOUR_SUPABASE_URL";          // e.g. https://abcd1234.supabase.co
window.SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"; // e.g. eyJhbGciOi...

window.SUPABASE_ENABLED =
  !!window.SUPABASE_URL &&
  window.SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
  !!window.SUPABASE_ANON_KEY &&
  window.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";

// Backwards-compat flag used by older comments; not required.
window.FIREBASE_ENABLED = false;
