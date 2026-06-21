/* ===========================================================
   ExamZen - Shared utilities
   Theme handling, toast, storage helpers, header/nav injection
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
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.textContent = next === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19";
    });
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  /* ---------- Storage helpers ---------- */
  function get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  function set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
  function del(key) {
    localStorage.removeItem(key);
  }

  /* ---------- Formatting ---------- */
  function fmtTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function fmtDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m} min ${s} sec`;
  }
  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* ---------- Header + bottom nav injection ---------- */
  function mountChrome(active = "") {
    initTheme();
    const themeIcon =
      (localStorage.getItem("theme") || "light") === "dark"
        ? "\u2600\uFE0F"
        : "\uD83C\uDF19";
    const user = EZAuth ? EZAuth.currentUser() : null;
    const profileLabel = user ? (user.name || "Profile").split(" ")[0] : "Login";

    const headerHost = document.getElementById("ez-header");
    if (headerHost) {
      headerHost.innerHTML = `
        <header class="app-header">
          <div class="container">
            <a class="brand" href="/index.html">
              <span class="logo">EZ</span><span>ExamZen</span>
            </a>
            <nav class="nav-desktop">
              <a href="/index.html" class="${active === "home" ? "active" : ""}">Home</a>
              <a href="/exams/index.html" class="${active === "exams" ? "active" : ""}">Mock Tests</a>
              <a href="/live-test/index.html" class="${active === "live" ? "active" : ""}">Live Tests</a>
              <a href="/pricing.html" class="${active === "pricing" ? "active" : ""}">Pricing</a>
              <a href="/saved.html" class="${active === "saved" ? "active" : ""}">Saved</a>
              <a href="/profile.html" class="${active === "profile" ? "active" : ""}">${profileLabel}</a>
            </nav>
            <div class="header-actions">
              <button class="icon-btn" data-theme-toggle title="Toggle theme">${themeIcon}</button>
            </div>
          </div>
        </header>`;
    }

    const navHost = document.getElementById("ez-bottomnav");
    if (navHost) {
      navHost.innerHTML = `
        <nav class="bottom-nav">
          <a href="/index.html" class="${active === "home" ? "active" : ""}"><span class="ico">\uD83C\uDFE0</span>Home</a>
          <a href="/exams/index.html" class="${active === "exams" ? "active" : ""}"><span class="ico">\uD83D\uDCDD</span>Exams</a>
          <a href="/live-test/index.html" class="${active === "live" ? "active" : ""}"><span class="ico">\uD83D\uDD34</span>Live</a>
          <a href="/profile.html" class="${active === "profile" ? "active" : ""}"><span class="ico">\uD83D\uDC64</span>Profile</a>
        </nav>`;
    }

    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.addEventListener("click", toggleTheme);
    });
  }

  return {
    initTheme, toggleTheme, toast, get, set, del,
    fmtTime, fmtDuration, qs, mountChrome,
  };
})();


/* ---------- PWA: service worker + install prompt ---------- */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show a lightweight install chip in the header area if present.
    const host = document.querySelector(".header-actions");
    if (!host || host.querySelector("[data-install]")) return;
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.dataset.install = "1";
    btn.title = "Install app";
    btn.textContent = "\u2B07\uFE0F";
    btn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.remove();
    });
    host.prepend(btn);
  });
})();
