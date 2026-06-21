/* ===========================================================
   ExamZen - Shared data store for payments & partner system
   -----------------------------------------------------------
   Local Mode: everything persists in localStorage. With Firebase
   these map to the collections: paymentRequests, partnerApplications,
   partners, payoutRequests. Keep the API stable when migrating.
   =========================================================== */

const EZStore = (() => {
  const BASE_PRICE = 124;          // price without coupon
  const COMMISSION_RATE = 0.8;     // partner earns 80% of the discount

  // Built-in (platform) coupons -> final price.
  const BUILTIN_COUPONS = { WELCOME: 99 };

  const read = (k) => EZ.get(k, []);
  const write = (k, v) => EZ.set(k, v);

  /* ---------- Collections ---------- */
  const payments = () => read("ez_payment_requests");
  const savePayments = (v) => write("ez_payment_requests", v);
  const applications = () => read("ez_partner_applications");
  const saveApplications = (v) => write("ez_partner_applications", v);
  const partners = () => read("ez_partners");
  const savePartners = (v) => write("ez_partners", v);
  const payouts = () => read("ez_payout_requests");
  const savePayouts = (v) => write("ez_payout_requests", v);

  /* ---------- Lookups ---------- */
  function findPartnerByCode(code) {
    code = (code || "").toUpperCase();
    return partners().find((p) => p.couponCode === code) || null;
  }
  function findPartnerByUser(uid) {
    return partners().find((p) => p.userId === uid) || null;
  }

  // Resolve a coupon to a price. Partner coupons grant the WELCOME price (99).
  function resolveCoupon(code) {
    code = (code || "").trim().toUpperCase();
    if (!code) return { valid: true, code: "NONE", price: BASE_PRICE, discount: 0 };
    if (BUILTIN_COUPONS[code] != null) {
      const price = BUILTIN_COUPONS[code];
      return { valid: true, code, price, discount: BASE_PRICE - price };
    }
    const p = findPartnerByCode(code);
    if (p && p.isActive) {
      const price = 99;
      return { valid: true, code, price, discount: BASE_PRICE - price, partner: true };
    }
    return { valid: false, code, price: BASE_PRICE, discount: 0 };
  }

  /* ---------- Mutations ---------- */
  function addPayment(req) {
    const list = payments();
    list.push(req);
    savePayments(list);
  }

  function approvePayment(reqId, adminUid) {
    const list = payments();
    const req = list.find((r) => r.id === reqId);
    if (!req || req.status !== "pending") return false;
    req.status = "approved";
    req.processedAt = new Date().toISOString();
    req.processedBy = adminUid || "admin";
    savePayments(list);

    // Grant premium to the buyer (same-browser users in Local Mode).
    const users = JSON.parse(localStorage.getItem("ez_users") || "{}");
    if (users[req.userId]) {
      users[req.userId].plan = "premium";
      users[req.userId].planExpiry = new Date(Date.now() + 365 * 86400000).toISOString();
      localStorage.setItem("ez_users", JSON.stringify(users));
    }

    // Credit the partner if a partner coupon was used.
    if (req.couponUsed && req.couponUsed !== "NONE") {
      const ps = partners();
      const p = ps.find((x) => x.couponCode === req.couponUsed);
      if (p) {
        const earn = Math.round((req.discount || 0) * COMMISSION_RATE);
        p.totalSales = (p.totalSales || 0) + 1;
        p.totalRevenue = (p.totalRevenue || 0) + earn;
        p.pendingPayout = (p.pendingPayout || 0) + earn;
        savePartners(ps);
      }
    }
    return true;
  }

  function rejectPayment(reqId, adminUid) {
    const list = payments();
    const req = list.find((r) => r.id === reqId);
    if (!req || req.status !== "pending") return false;
    req.status = "rejected";
    req.processedAt = new Date().toISOString();
    req.processedBy = adminUid || "admin";
    savePayments(list);
    return true;
  }

  function addApplication(app) {
    const list = applications();
    list.push(app);
    saveApplications(list);
  }

  function approveApplication(appId) {
    const list = applications();
    const app = list.find((a) => a.id === appId);
    if (!app || app.status !== "pending") return false;
    if (findPartnerByCode(app.couponCode)) return false; // code taken
    app.status = "approved";
    app.approvedAt = new Date().toISOString();
    saveApplications(list);

    const ps = partners();
    ps.push({
      couponCode: app.couponCode.toUpperCase(),
      userId: app.userId,
      username: app.username,
      upiId: app.upiId,
      totalSales: 0,
      totalRevenue: 0,
      totalWithdrawn: 0,
      pendingPayout: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    savePartners(ps);

    // Flag the user as a partner.
    const users = JSON.parse(localStorage.getItem("ez_users") || "{}");
    if (users[app.userId]) {
      users[app.userId].isPartner = true;
      localStorage.setItem("ez_users", JSON.stringify(users));
    }
    return true;
  }

  function rejectApplication(appId) {
    const list = applications();
    const app = list.find((a) => a.id === appId);
    if (!app || app.status !== "pending") return false;
    app.status = "rejected";
    saveApplications(list);
    return true;
  }

  function addPayout(req) {
    const list = payouts();
    list.push(req);
    savePayouts(list);
  }

  function payPayout(reqId) {
    const list = payouts();
    const req = list.find((r) => r.id === reqId);
    if (!req || req.status !== "pending") return false;
    req.status = "paid";
    req.paidAt = new Date().toISOString();
    savePayouts(list);

    const ps = partners();
    const p = ps.find((x) => x.couponCode === req.couponCode);
    if (p) {
      p.pendingPayout = Math.max(0, (p.pendingPayout || 0) - req.amount);
      p.totalWithdrawn = (p.totalWithdrawn || 0) + req.amount;
      savePartners(ps);
    }
    return true;
  }

  function rejectPayout(reqId) {
    const list = payouts();
    const req = list.find((r) => r.id === reqId);
    if (!req || req.status !== "pending") return false;
    req.status = "rejected";
    savePayouts(list);
    return true;
  }

  return {
    BASE_PRICE, COMMISSION_RATE,
    payments, applications, partners, payouts,
    findPartnerByCode, findPartnerByUser, resolveCoupon,
    addPayment, approvePayment, rejectPayment,
    addApplication, approveApplication, rejectApplication,
    addPayout, payPayout, rejectPayout,
  };
})();
