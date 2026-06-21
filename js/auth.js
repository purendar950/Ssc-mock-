/* ===========================================================
   ExamZen - Authentication (dual mode)
   -----------------------------------------------------------
   SUPABASE MODE  (when js/firebase-config.js has real values):
     - Real email/password auth via Supabase Auth
     - User status read from the "profiles" table
       (is_paid, expires_at, role, is_partner, partner_coupon)
     - Login by username OR email (username -> email via RPC)
   LOCAL MODE (default): users + session in localStorage.

   Public API is identical in both modes. currentUser()/isPremium()
   are synchronous (backed by an in-memory + localStorage cache that
   Supabase hydrates), so existing pages need no changes. register()/
   login()/logout()/updateUser()/grantPremium() return Promises.
   Await EZAuth.ready to know the initial session has been restored.
   =========================================================== */

const EZAuth = (() => {
  const SUPA = !!window.SUPABASE_ENABLED;
  const USERS_KEY = "ez_users";
  const SESSION_KEY = "ez_session";
  const SB_CACHE = "ez_sb_profile";
  let client = null;
  const listeners = [];

  /* ---------------- shared helpers ---------------- */
  function computePlan(isPaid, expiry) {
    if (!isPaid) return "free";
    if (expiry && new Date(expiry).getTime() <= Date.now()) return "free";
    return "premium";
  }
  function notify() { listeners.forEach((cb) => { try { cb(currentUser()); } catch {} }); }
  function onChange(cb) { listeners.push(cb); }

  /* ===================================================
     LOCAL MODE
     =================================================== */
  function _users() { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); }
  function _saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

  function localCurrentUser() {
    const uid = localStorage.getItem(SESSION_KEY);
    if (!uid) return null;
    const u = _users()[uid];
    return u ? { uid, ...u } : null;
  }
  async function localRegister({ name, username, email, password }) {
    username = (username || "").trim(); email = (email || "").trim().toLowerCase();
    if (!name || !username || !email || !password) return { ok: false, error: "All fields are required." };
    if (!/^[A-Za-z0-9]+$/.test(username)) return { ok: false, error: "Username may contain only letters and numbers." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    const users = _users();
    for (const uid in users) {
      if (users[uid].username.toLowerCase() === username.toLowerCase()) return { ok: false, error: "Username already taken." };
      if (users[uid].email === email) return { ok: false, error: "An account with this email already exists." };
    }
    const uid = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    users[uid] = { name, username, email, password, plan: "free", planExpiry: null, partnerCode: "NONE", isPartner: false, isAdmin: false, createdAt: new Date().toISOString() };
    _saveUsers(users); localStorage.setItem(SESSION_KEY, uid); notify();
    return { ok: true, user: { uid, ...users[uid] } };
  }
  async function localLogin({ identifier, password }) {
    identifier = (identifier || "").trim().toLowerCase();
    const users = _users();
    for (const uid in users) {
      const u = users[uid];
      if (u.email === identifier || u.username.toLowerCase() === identifier) {
        if (u.password !== password) return { ok: false, error: "Incorrect password." };
        localStorage.setItem(SESSION_KEY, uid); notify();
        return { ok: true, user: { uid, ...u } };
      }
    }
    return { ok: false, error: "No account found for that username/email." };
  }
  async function localUpdate(patch) {
    const uid = localStorage.getItem(SESSION_KEY);
    if (!uid) return false;
    const users = _users(); if (!users[uid]) return false;
    users[uid] = { ...users[uid], ...patch }; _saveUsers(users); notify(); return true;
  }
  async function localLogout() { localStorage.removeItem(SESSION_KEY); notify(); }

  /* ===================================================
     SUPABASE MODE
     =================================================== */
  function loadSDK() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve();
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = resolve; s.onerror = () => reject(new Error("Failed to load Supabase SDK"));
      document.head.appendChild(s);
    });
  }
  function sbCacheGet() { try { return JSON.parse(localStorage.getItem(SB_CACHE)); } catch { return null; } }
  function sbCacheSet(p) { if (p) localStorage.setItem(SB_CACHE, JSON.stringify(p)); else localStorage.removeItem(SB_CACHE); }

  function mapRow(row) {
    return {
      uid: row.id, name: row.name || "", username: row.username || "", email: row.email || "",
      plan: computePlan(row.is_paid, row.expires_at), planExpiry: row.expires_at || null,
      isAdmin: row.role === "admin", isPartner: !!row.is_partner, partnerCode: row.partner_coupon || "NONE",
    };
  }
  async function sbRefreshProfile() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) { sbCacheSet(null); notify(); return null; }
    const { data: row } = await client.from("profiles").select("*").eq("id", user.id).single();
    if (row) sbCacheSet(mapRow(row));
    else sbCacheSet({ uid: user.id, email: user.email, username: "", name: "", plan: "free", isAdmin: false, isPartner: false });
    notify();
    return currentUser();
  }
  async function sbInit() {
    await loadSDK();
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const { data: { session } } = await client.auth.getSession();
    if (session) await sbRefreshProfile(); else sbCacheSet(null);
    client.auth.onAuthStateChange((_e, s) => { if (s) sbRefreshProfile(); else { sbCacheSet(null); notify(); } });
  }
  async function sbRegister({ name, username, email, password }) {
    username = (username || "").trim(); email = (email || "").trim().toLowerCase();
    if (!name || !username || !email || !password) return { ok: false, error: "All fields are required." };
    if (!/^[A-Za-z0-9]+$/.test(username)) return { ok: false, error: "Username may contain only letters and numbers." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    try {
      const { data: taken } = await client.rpc("username_taken", { uname: username });
      if (taken) return { ok: false, error: "Username already taken." };
    } catch {}
    const { error } = await client.auth.signUp({ email, password, options: { data: { username, name } } });
    if (error) return { ok: false, error: error.message };
    await sbRefreshProfile();
    const u = currentUser();
    if (!u) return { ok: true, needsConfirmation: true };
    return { ok: true, user: u };
  }
  async function sbLogin({ identifier, password }) {
    identifier = (identifier || "").trim();
    let email = identifier;
    if (!identifier.includes("@")) {
      try {
        const { data, error } = await client.rpc("email_for_username", { uname: identifier.toLowerCase() });
        if (error || !data) return { ok: false, error: "No account found for that username." };
        email = data;
      } catch { return { ok: false, error: "Could not resolve username." }; }
    }
    const { error } = await client.auth.signInWithPassword({ email: email.toLowerCase(), password });
    if (error) return { ok: false, error: error.message };
    await sbRefreshProfile();
    return { ok: true, user: currentUser() };
  }
  async function sbUpdate(patch) {
    const u = currentUser(); if (!u) return false;
    const row = {};
    if ("plan" in patch) row.is_paid = patch.plan === "premium";
    if ("planExpiry" in patch) row.expires_at = patch.planExpiry;
    if ("isAdmin" in patch) row.role = patch.isAdmin ? "admin" : "user";
    if ("isPartner" in patch) row.is_partner = !!patch.isPartner;
    if ("partnerCode" in patch) row.partner_coupon = patch.partnerCode;
    if ("name" in patch) row.name = patch.name;
    const { error } = await client.from("profiles").update(row).eq("id", u.uid);
    if (error) return false;
    await sbRefreshProfile(); return true;
  }
  async function sbLogout() { try { await client.auth.signOut(); } catch {} sbCacheSet(null); notify(); }

  /* ===================================================
     PUBLIC API
     =================================================== */
  function currentUser() { return SUPA ? sbCacheGet() : localCurrentUser(); }
  function isPremium() {
    const u = currentUser();
    if (!u || u.plan !== "premium") return false;
    if (!u.planExpiry) return true;
    return new Date(u.planExpiry).getTime() > Date.now();
  }
  function register(args) { return SUPA ? sbRegister(args) : localRegister(args); }
  function login(args) { return SUPA ? sbLogin(args) : localLogin(args); }
  function updateUser(patch) { return SUPA ? sbUpdate(patch) : localUpdate(patch); }
  function grantPremium(days = 365) {
    const expiry = new Date(Date.now() + days * 86400000).toISOString();
    return updateUser({ plan: "premium", planExpiry: expiry });
  }
  function logout() { return SUPA ? sbLogout() : localLogout(); }
  function requireLogin(redirect = "/login.html") {
    if (!currentUser()) {
      const back = encodeURIComponent(location.pathname + location.search);
      location.href = `${redirect}?next=${back}`;
      return false;
    }
    return true;
  }

  const ready = (SUPA ? sbInit() : Promise.resolve()).catch((e) => console.warn("Auth init:", e));

  return { ready, onChange, currentUser, isPremium, register, login, updateUser, grantPremium, logout, requireLogin, mode: SUPA ? "supabase" : "local" };
})();
