/* ===========================================================
   ExamZen - Payments & partner store (dual mode, async)
   -----------------------------------------------------------
   SUPABASE MODE: payment_requests / partner_applications /
     partners / payout_requests tables + SECURITY DEFINER RPCs
     (approve_payment, approve_application, request_payout, ...).
   LOCAL MODE: localStorage collections.

   All methods are async (return Promises). Call await EZAuth.ready
   before relying on the Supabase client.
   =========================================================== */

const EZStore = (() => {
  const SUPA = !!window.SUPABASE_ENABLED;
  const BASE_PRICE = 124;
  const COMMISSION_RATE = 0.8;
  const BUILTIN_COUPONS = { WELCOME: 99 };

  const sb = () => (typeof EZAuth !== "undefined" ? EZAuth.getClient() : null);

  /* ===================================================
     LOCAL MODE helpers
     =================================================== */
  const read = (k) => EZ.get(k, []);
  const write = (k, v) => EZ.set(k, v);
  const L = {
    payments: () => read("ez_payment_requests"),
    savePayments: (v) => write("ez_payment_requests", v),
    applications: () => read("ez_partner_applications"),
    saveApplications: (v) => write("ez_partner_applications", v),
    partners: () => read("ez_partners"),
    savePartners: (v) => write("ez_partners", v),
    payouts: () => read("ez_payout_requests"),
    savePayouts: (v) => write("ez_payout_requests", v),
  };

  function localResolveCoupon(code) {
    code = (code || "").trim().toUpperCase();
    if (!code) return { valid: true, code: "NONE", price: BASE_PRICE, discount: 0 };
    if (BUILTIN_COUPONS[code] != null) return { valid: true, code, price: BUILTIN_COUPONS[code], discount: BASE_PRICE - BUILTIN_COUPONS[code] };
    const p = L.partners().find((x) => x.couponCode === code);
    if (p && p.isActive) return { valid: true, code, price: 99, discount: BASE_PRICE - 99, partner: true };
    return { valid: false, code, price: BASE_PRICE, discount: 0 };
  }

  /* ===================================================
     Normalizers so pages get one consistent shape
     =================================================== */
  // Payment row -> {id, userId, username, email, phone, utr, amount, discount, couponUsed, status, submittedAt}
  function normPay(r) {
    return SUPA
      ? { id: r.id, userId: r.user_id, username: r.username, email: r.email, phone: r.phone, utr: r.utr, amount: r.amount, discount: r.discount, couponUsed: r.coupon_used, status: r.status, submittedAt: r.created_at }
      : r;
  }
  function normApp(r) {
    return SUPA
      ? { id: r.id, userId: r.user_id, username: r.username, email: r.email, phone: r.phone, upiId: r.upi_id, socialLinks: r.social_links, couponCode: r.coupon_code, status: r.status, appliedAt: r.applied_at }
      : r;
  }
  function normPartner(r) {
    return SUPA
      ? { couponCode: r.coupon_code, userId: r.user_id, username: r.username, upiId: r.upi_id, totalSales: r.total_sales, totalRevenue: r.total_revenue, totalWithdrawn: r.total_withdrawn, pendingPayout: r.pending_payout, isActive: r.is_active }
      : r;
  }
  function normPayout(r) {
    return SUPA
      ? { id: r.id, partnerId: r.partner_id, couponCode: r.coupon_code, amount: r.amount, upiId: r.upi_id, status: r.status, requestedAt: r.requested_at, paidAt: r.paid_at }
      : r;
  }

  /* ===================================================
     PUBLIC API (async)
     =================================================== */
  async function resolveCoupon(code) {
    if (!SUPA) return localResolveCoupon(code);
    const { data, error } = await sb().rpc("resolve_coupon", { code: code || "" });
    if (error || !data) return { valid: false, code: (code || "").toUpperCase(), price: BASE_PRICE, discount: 0 };
    return data;
  }

  async function listPayments() {
    if (!SUPA) return L.payments();
    const { data } = await sb().from("payment_requests").select("*").order("created_at", { ascending: false });
    return (data || []).map(normPay);
  }
  async function addPayment(req) {
    if (!SUPA) { const l = L.payments(); l.push(req); L.savePayments(l); return; }
    await sb().from("payment_requests").insert({
      user_id: req.userId, username: req.username, email: req.email, phone: req.phone,
      utr: req.utr, amount: req.amount, discount: req.discount, coupon_used: req.couponUsed,
    });
  }
  async function approvePayment(id, adminUid) {
    if (!SUPA) return localApprovePayment(id, adminUid);
    const { error } = await sb().rpc("approve_payment", { req_id: id });
    return !error;
  }
  async function rejectPayment(id) {
    if (!SUPA) { const l = L.payments(); const r = l.find((x) => x.id === id); if (r && r.status === "pending") { r.status = "rejected"; r.processedAt = new Date().toISOString(); L.savePayments(l); return true; } return false; }
    const { error } = await sb().rpc("reject_payment", { req_id: id });
    return !error;
  }

  async function listApplications() {
    if (!SUPA) return L.applications();
    const { data } = await sb().from("partner_applications").select("*").order("applied_at", { ascending: false });
    return (data || []).map(normApp);
  }
  async function addApplication(app) {
    if (!SUPA) { const l = L.applications(); l.push(app); L.saveApplications(l); return; }
    await sb().from("partner_applications").insert({
      user_id: app.userId, username: app.username, email: app.email, phone: app.phone,
      upi_id: app.upiId, social_links: app.socialLinks, coupon_code: app.couponCode,
    });
  }
  async function approveApplication(id) {
    if (!SUPA) return localApproveApplication(id);
    const { error } = await sb().rpc("approve_application", { app_id: id });
    return !error;
  }
  async function rejectApplication(id) {
    if (!SUPA) { const l = L.applications(); const a = l.find((x) => x.id === id); if (a && a.status === "pending") { a.status = "rejected"; L.saveApplications(l); return true; } return false; }
    const { error } = await sb().rpc("reject_application", { app_id: id });
    return !error;
  }

  async function listPartners() {
    if (!SUPA) return L.partners();
    const { data } = await sb().from("partners").select("*");
    return (data || []).map(normPartner);
  }
  async function findPartnerByUser(uid) {
    const list = await listPartners();
    return list.find((p) => p.userId === uid) || null;
  }
  async function findPartnerByCode(code) {
    code = (code || "").toUpperCase();
    const list = await listPartners();
    return list.find((p) => p.couponCode === code) || null;
  }

  async function listPayouts() {
    if (!SUPA) return L.payouts();
    const { data } = await sb().from("payout_requests").select("*").order("requested_at", { ascending: false });
    return (data || []).map(normPayout);
  }
  async function addPayout(req) {
    if (!SUPA) { const l = L.payouts(); l.push(req); L.savePayouts(l); return true; }
    const { error } = await sb().rpc("request_payout", { amt: req.amount });
    return !error;
  }
  async function payPayout(id) {
    if (!SUPA) return localPayPayout(id);
    const { error } = await sb().rpc("pay_payout", { po_id: id });
    return !error;
  }
  async function rejectPayout(id) {
    if (!SUPA) { const l = L.payouts(); const r = l.find((x) => x.id === id); if (r && r.status === "pending") { r.status = "rejected"; L.savePayouts(l); return true; } return false; }
    const { error } = await sb().rpc("reject_payout", { po_id: id });
    return !error;
  }

  async function adminStats() {
    if (!SUPA) {
      const users = JSON.parse(localStorage.getItem("ez_users") || "{}");
      const arr = Object.values(users);
      const revenue = L.payments().filter((p) => p.status === "approved").reduce((s, p) => s + (p.amount || 0), 0);
      return { users: arr.length, premium: arr.filter((x) => x.plan === "premium").length, revenue, partners: L.partners().length };
    }
    const { data } = await sb().rpc("admin_stats");
    return data || { users: 0, premium: 0, revenue: 0, partners: 0 };
  }

  /* ===================================================
     LOCAL-only mutation internals
     =================================================== */
  function localApprovePayment(id, adminUid) {
    const l = L.payments(); const r = l.find((x) => x.id === id);
    if (!r || r.status !== "pending") return false;
    r.status = "approved"; r.processedAt = new Date().toISOString(); r.processedBy = adminUid || "admin"; L.savePayments(l);
    const users = JSON.parse(localStorage.getItem("ez_users") || "{}");
    if (users[r.userId]) { users[r.userId].plan = "premium"; users[r.userId].planExpiry = new Date(Date.now() + 365 * 86400000).toISOString(); localStorage.setItem("ez_users", JSON.stringify(users)); }
    if (r.couponUsed && r.couponUsed !== "NONE") {
      const ps = L.partners(); const p = ps.find((x) => x.couponCode === r.couponUsed);
      if (p) { const earn = Math.round((r.discount || 0) * COMMISSION_RATE); p.totalSales = (p.totalSales || 0) + 1; p.totalRevenue = (p.totalRevenue || 0) + earn; p.pendingPayout = (p.pendingPayout || 0) + earn; L.savePartners(ps); }
    }
    return true;
  }
  function localApproveApplication(id) {
    const l = L.applications(); const a = l.find((x) => x.id === id);
    if (!a || a.status !== "pending") return false;
    if (L.partners().find((p) => p.couponCode === a.couponCode.toUpperCase())) return false;
    a.status = "approved"; a.approvedAt = new Date().toISOString(); L.saveApplications(l);
    const ps = L.partners();
    ps.push({ couponCode: a.couponCode.toUpperCase(), userId: a.userId, username: a.username, upiId: a.upiId, totalSales: 0, totalRevenue: 0, totalWithdrawn: 0, pendingPayout: 0, isActive: true, createdAt: new Date().toISOString() });
    L.savePartners(ps);
    const users = JSON.parse(localStorage.getItem("ez_users") || "{}");
    if (users[a.userId]) { users[a.userId].isPartner = true; localStorage.setItem("ez_users", JSON.stringify(users)); }
    return true;
  }
  function localPayPayout(id) {
    const l = L.payouts(); const r = l.find((x) => x.id === id);
    if (!r || r.status !== "pending") return false;
    r.status = "paid"; r.paidAt = new Date().toISOString(); L.savePayouts(l);
    const ps = L.partners(); const p = ps.find((x) => x.couponCode === r.couponCode);
    if (p) { p.pendingPayout = Math.max(0, (p.pendingPayout || 0) - r.amount); p.totalWithdrawn = (p.totalWithdrawn || 0) + r.amount; L.savePartners(ps); }
    return true;
  }

  return {
    BASE_PRICE, COMMISSION_RATE, mode: SUPA ? "supabase" : "local",
    resolveCoupon,
    listPayments, addPayment, approvePayment, rejectPayment,
    listApplications, addApplication, approveApplication, rejectApplication,
    listPartners, findPartnerByUser, findPartnerByCode,
    listPayouts, addPayout, payPayout, rejectPayout,
    adminStats,
  };
})();
