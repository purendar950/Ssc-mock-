/* ===========================================================
   ExamZen - Authentication module
   -----------------------------------------------------------
   Provides a single EZAuth API used across the app.

   LOCAL MODE (default): users + session stored in localStorage,
   so registration/login/premium all work without a backend.

   FIREBASE MODE: when js/firebase-config.js holds real values,
   swap the internals of register/login/etc. with Firebase Auth
   + Firestore calls (see README for the mapping). The public
   API below stays identical, so no page code needs to change.
   =========================================================== */

const EZAuth = (() => {
  const USERS_KEY = "ez_users";
  const SESSION_KEY = "ez_session";

  function _users() {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
  }
  function _saveUsers(u) {
    localStorage.setItem(USERS_KEY, JSON.stringify(u));
  }

  function currentUser() {
    const uid = localStorage.getItem(SESSION_KEY);
    if (!uid) return null;
    const u = _users()[uid];
    return u ? { uid, ...u } : null;
  }

  function isPremium() {
    const u = currentUser();
    if (!u || u.plan !== "premium") return false;
    if (!u.planExpiry) return true;
    return new Date(u.planExpiry).getTime() > Date.now();
  }

  function register({ name, username, email, password }) {
    username = (username || "").trim();
    email = (email || "").trim().toLowerCase();
    if (!name || !username || !email || !password)
      return { ok: false, error: "All fields are required." };
    if (!/^[A-Za-z0-9]+$/.test(username))
      return { ok: false, error: "Username may contain only letters and numbers." };
    if (password.length < 6)
      return { ok: false, error: "Password must be at least 6 characters." };

    const users = _users();
    for (const uid in users) {
      if (users[uid].username.toLowerCase() === username.toLowerCase())
        return { ok: false, error: "Username already taken." };
      if (users[uid].email === email)
        return { ok: false, error: "An account with this email already exists." };
    }

    const uid = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    users[uid] = {
      name,
      username,
      email,
      password, // demo only; Firebase Auth manages real hashing
      plan: "free",
      planExpiry: null,
      partnerCode: "NONE",
      isPartner: false,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };
    _saveUsers(users);
    localStorage.setItem(SESSION_KEY, uid);
    return { ok: true, user: { uid, ...users[uid] } };
  }

  function login({ identifier, password }) {
    identifier = (identifier || "").trim().toLowerCase();
    const users = _users();
    for (const uid in users) {
      const u = users[uid];
      const match =
        u.email === identifier || u.username.toLowerCase() === identifier;
      if (match) {
        if (u.password !== password)
          return { ok: false, error: "Incorrect password." };
        localStorage.setItem(SESSION_KEY, uid);
        return { ok: true, user: { uid, ...u } };
      }
    }
    return { ok: false, error: "No account found for that username/email." };
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function updateUser(patch) {
    const uid = localStorage.getItem(SESSION_KEY);
    if (!uid) return false;
    const users = _users();
    if (!users[uid]) return false;
    users[uid] = { ...users[uid], ...patch };
    _saveUsers(users);
    return true;
  }

  // Mark current user premium (used after admin approval / demo upgrade)
  function grantPremium(days = 365) {
    const expiry = new Date(Date.now() + days * 86400000).toISOString();
    return updateUser({ plan: "premium", planExpiry: expiry });
  }

  function requireLogin(redirect = "/login.html") {
    if (!currentUser()) {
      const back = encodeURIComponent(location.pathname + location.search);
      location.href = `${redirect}?next=${back}`;
      return false;
    }
    return true;
  }

  return {
    currentUser, isPremium, register, login, logout,
    updateUser, grantPremium, requireLogin,
  };
})();
