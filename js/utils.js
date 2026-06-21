/* ===========================================================
   ExamZen - Shared utilities + app-style chrome
   (Mock Matrix Hub-inspired top bar, sidebar, bottom nav)
   =========================================================== */

const EZ = (() => {
  /* ---------- Theme ---------- */
  function initTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", theme);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    const sw = document.getElementById("themeSwitch");
    if (sw) sw.checked = next === "dark";
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  /* ---------- Storage ---------- */
  function get(key, fb = null) { try { const v = localStorage.getItem(key); return v === null ? fb : JSON.parse(v); } catch { return fb; } }
  function set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function del(key) { localStorage.removeItem(key); }

  /* ---------- Formatting ---------- */
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  }
  function fmtDuration(s) { return `${Math.floor(s / 60)} min ${Math.floor(s % 60)} sec`; }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  /* ---------- Base-aware URL resolver (works under GitHub Pages subpath) ---------- */
  function url(p) {
    p = String(p);
    if (/^(https?:)?\/\//.test(p) || /^(mailto:|tel:)/.test(p) || p.charAt(0) === "#") return p;
    const basePath = new URL(".", document.baseURI).pathname; // "/Ssc-mock-/" or "/"
    if (p.charAt(0) === "/") {
      if (p.indexOf(basePath) === 0) return p;          // already includes base
      return basePath.replace(/\/$/, "") + p;
    }
    return new URL(p, document.baseURI).href;            // relative -> full URL (keeps query)
  }

  /* ---------- Font Awesome (icons) ---------- */
  function ensureIcons() {
    if (document.getElementById("ez-fa")) return;
    const l = document.createElement("link");
    l.id = "ez-fa"; l.rel = "stylesheet";
    l.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
    document.head.appendChild(l);
  }

  /* ---------- Chrome: top bar + sidebar + bottom nav + FABs ---------- */
  let _activeNav = "";
  let _chromeHooked = false;
  function mountChrome(active = "") {
    _activeNav = active || _activeNav;
    initTheme();
    ensureIcons();

    // Idempotent: remove any previously injected chrome so re-renders are clean.
    document.querySelectorAll(".app-topbar, #ez-sidebar, #ez-sb-overlay, .app-bottomnav, .fab-stack").forEach((el) => el.remove());

    const user = (typeof EZAuth !== "undefined") ? EZAuth.currentUser() : null;
    const premium = user && typeof EZAuth !== "undefined" ? EZAuth.isPremium() : false;
    const isAdmin = !!(user && (user.isAdmin || (user.username || "").toLowerCase() === "admin"));
    const isPartner = !!(user && user.isPartner);
    const initial = (user ? (user.username || user.name || "U") : "U").charAt(0).toUpperCase();
    const dark = (localStorage.getItem("theme") || "light") === "dark";

    /* Top bar */
    const header = document.createElement("header");
    header.className = "app-topbar";
    header.innerHTML = `
      <div class="left">
        <button class="burger" aria-label="Menu" onclick="EZ.toggleSidebar()"><i class="fas fa-bars"></i></button>
        <a class="brand" href="index.html">
          <span class="logo">EZ</span><span>EXAM<span class="hub">ZEN</span></span>
        </a>
      </div>
      <div>${user
        ? `<button class="avatar-btn" onclick="EZ.toggleSidebar()">${initial}</button>`
        : `<a class="btn btn-primary btn-sm" href="login.html"><i class="fas fa-right-to-bracket"></i> Login</a>`}
      </div>`;

    /* Sidebar */
    const overlay = document.createElement("div");
    overlay.className = "app-sidebar-overlay";
    overlay.id = "ez-sb-overlay";
    overlay.onclick = toggleSidebar;

    const sidebar = document.createElement("nav");
    sidebar.className = "app-sidebar";
    sidebar.id = "ez-sidebar";
    sidebar.innerHTML = `
      <div class="sb-head">
        <div class="sb-avatar">${initial}</div>
        <div>
          <div style="font-weight:800">${user ? (user.username || user.name) : "Guest"}</div>
          <div style="font-size:.8rem;opacity:.9">${user ? (premium ? "⭐ PRO Member" : "Free plan") : "Not logged in"}</div>
        </div>
      </div>
      <div class="sb-menu">
        <a class="sb-item" href="index.html"><i class="fas fa-house"></i> Home</a>
        <a class="sb-item" href="exams/index.html"><i class="fas fa-file-signature"></i> Mock Tests</a>
        <a class="sb-item" href="live-test/index.html"><i class="fas fa-bolt"></i> Live Mocks</a>
        <a class="sb-item" href="series/index.html"><i class="fas fa-layer-group"></i> Series</a>
        ${isAdmin ? `<a class="sb-item admin" href="admin-vault.html"><i class="fas fa-user-shield"></i> Admin Panel</a>` : ""}
        ${isPartner
          ? `<a class="sb-item admin" href="partner-dashboard.html"><i class="fas fa-chart-pie"></i> Earnings</a>`
          : `<a class="sb-item" href="apply-coupon.html"><i class="fas fa-handshake"></i> Become a Partner</a>`}
        ${premium ? "" : `<a class="sb-item pro" href="buy-premium.html"><i class="fas fa-crown"></i> Buy Premium</a>`}
        <div class="sb-divider"></div>
        <a class="sb-item" href="saved.html"><i class="fas fa-bookmark"></i> Saved Questions</a>
        <a class="sb-item" href="profile.html"><i class="fas fa-user"></i> My Profile</a>
        <div class="sb-item" onclick="EZ.toggleTheme()">
          <i class="fas fa-moon"></i> Dark Mode
          <label class="form-switch" style="margin-left:auto"><input type="checkbox" id="themeSwitch" ${dark ? "checked" : ""} onclick="event.preventDefault();EZ.toggleTheme()"></label>
        </div>
        <a class="sb-item" href="privacy-policy.html"><i class="fas fa-shield-halved"></i> Privacy Policy</a>
        ${user ? `<div class="sb-divider"></div><div class="sb-item" style="color:var(--danger)" onclick="EZ.logout()"><i class="fas fa-right-from-bracket"></i> Logout</div>` : ""}
      </div>`;

    /* Bottom nav */
    const nav = document.createElement("nav");
    nav.className = "app-bottomnav";
    const a = (k) => active === k ? "active" : "";
    nav.innerHTML = `
      <a class="${a("home")}" href="index.html"><i class="fas fa-house"></i>HOME</a>
      <a class="${a("exams")}" href="exams/index.html"><i class="fas fa-file-pen"></i>EXAMS</a>
      <a class="${a("live")}" href="live-test/index.html"><i class="fas fa-bolt"></i>LIVE</a>
      <a class="${a("profile")}" href="profile.html"><i class="fas fa-user-circle"></i>PROFILE</a>`;

    /* FABs */
    const fabs = document.createElement("div");
    fabs.className = "fab-stack";
    fabs.innerHTML = `
      <a class="fab wa" href="https://whatsapp.com" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i></a>
      <a class="fab tg" href="https://t.me" target="_blank" rel="noopener"><i class="fab fa-telegram-plane"></i></a>`;

    document.body.prepend(header);
    document.body.appendChild(overlay);
    document.body.appendChild(sidebar);
    document.body.appendChild(nav);
    document.body.appendChild(fabs);

    // Ensure main content clears the fixed header.
    document.querySelectorAll(".page").forEach((p) => p.classList.add("app-page"));

    // Re-render chrome once the session resolves (Supabase) and on auth changes.
    if (!_chromeHooked && typeof EZAuth !== "undefined") {
      _chromeHooked = true;
      if (EZAuth.ready) EZAuth.ready.then(() => mountChrome(_activeNav));
      if (EZAuth.onChange) EZAuth.onChange(() => mountChrome(_activeNav));
    }
  }

  function toggleSidebar() {
    document.getElementById("ez-sidebar")?.classList.toggle("show");
    document.getElementById("ez-sb-overlay")?.classList.toggle("show");
  }

  function logout() {
    if (typeof EZAuth !== "undefined") EZAuth.logout();
    toast("Logged out");
    setTimeout(() => (location.href = EZ.url("index.html")), 500);
  }

  return { initTheme, toggleTheme, toast, get, set, del, fmtTime, fmtDuration, qs, url, mountChrome, toggleSidebar, logout };
})();

/* ---------- PWA: service worker + install banner ---------- */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register(EZ.url("sw.js")).catch(() => {}));
  }
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    const b = document.createElement("div");
    b.className = "install-banner";
    b.innerHTML = `<span><i class="fas fa-mobile-screen"></i> Install ExamZen for a better experience!</span>
      <button class="btn btn-primary btn-sm" id="ez-install">Install</button>
      <button class="btn btn-sm btn-outline" id="ez-install-x">✕</button>`;
    document.body.appendChild(b);
    b.querySelector("#ez-install").onclick = async () => { b.remove(); if (deferred) { deferred.prompt(); deferred = null; } };
    b.querySelector("#ez-install-x").onclick = () => b.remove();
  });
})();
