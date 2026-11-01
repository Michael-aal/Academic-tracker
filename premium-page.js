(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "") + "/api";
  const token = localStorage.getItem("academic-tracker-token");
  const $ = id => document.getElementById(id);
  let catalog = { plans: [], bundles: [], fxConfigured: false };
  let billingPeriod = "monthly";
  const ngn = kobo => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kobo / 100);
  const headers = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + token });
  function alertUser(message, type = "error") {
    const el = $("page-alert"); el.textContent = message; el.className = "page-alert " + type; el.hidden = false;
  }
  async function request(path, options = {}) {
    const r = await fetch(API + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }
  function amountFor(item, multiplier = 1) {
    return displayCurrency === "USD" ? usd(item.amountUsdCents * multiplier)
      : item.amountNgnKobo != null ? ngn(item.amountNgnKobo * multiplier) : "NGN rate not configured";
  }
  function checkoutReady(item) { return Boolean(catalog.paymentsConfigured && catalog.fxConfigured && item?.amountNgnKobo != null); }
  function renderPlans() {
    const plans = catalog.plans || [];
    const monthly = plans.find(p => p.key === "monthly");
    const yearly = plans.find(p => p.key === "yearly");
    const selected = billingPeriod === "yearly" ? yearly : monthly;
    const freeCard = '<article class="plan-card free-plan-card">' +
      '<p class="plan-kicker">GET STARTED</p><h3>Free</h3>' +
      '<div class="price">₦0</div><div class="price-secondary">Forever free · No payment required</div>' +
      '<ul class="plan-features"><li>Core academic tracking tools</li><li>Essential study features</li></ul>' +
      '<button class="premium-buy free-plan-button" type="button" disabled>Free plan</button></article>';
    const premiumCard = selected
      ? '<article class="plan-card featured premium-plan-card">' +
        '<p class="plan-kicker">UNLOCK MORE</p><h3>Premium</h3>' +
        '<div class="price">' + amountFor(selected) + '</div>' +
        '<div class="period">One-time payment for ' + selected.durationDays + ' days. Pay the full amount upfront.</div>' +
        '<ul class="plan-features"><li>Premium access for the full selected period</li><li>Access to Premium learning tools</li>' + (selected.credits ? '<li>' + selected.credits.toLocaleString() + ' AI credits included</li>' : '') + '</ul>' +
        '<button class="premium-buy" data-plan="' + escapeHtml(selected.key) + '" type="button"' + (checkoutReady(selected) ? '' : ' disabled') + '>' +
        (checkoutReady(selected) ? 'Pay ' + amountFor(selected) + ' · Continue' : 'Checkout unavailable') + '</button>' +
        '</article>'
      : '<div class="loading-card">The ' + billingPeriod + ' Premium option is not configured yet.</div>';
    $("plan-grid").innerHTML = freeCard + premiumCard;
    $("billing-monthly").setAttribute("aria-pressed", String(billingPeriod === "monthly"));
    $("billing-yearly").setAttribute("aria-pressed", String(billingPeriod === "yearly"));
    document.querySelectorAll("[data-plan]").forEach(b => b.addEventListener("click", () => startPurchase("PLAN", b.dataset.plan)));
  }
  async function startPurchase(type, key) {
    if (!token) { location.href = "login.html"; return; }
    if (!catalog.paymentsConfigured || !catalog.fxConfigured) { alertUser("Paystack checkout is not configured yet. Please contact support."); return; }
    const body = { type, key };

    try {
      document.querySelectorAll(".premium-buy").forEach(b => b.disabled = true);
      const result = await request("/premium/initialize", { method: "POST", body: JSON.stringify(body) });
      if (!result.authorizationUrl) throw new Error("Paystack did not return a checkout link.");
      location.assign(result.authorizationUrl);
    } catch (e) { alertUser(e.message); }
    finally { document.querySelectorAll(".premium-buy").forEach(b => b.disabled = false); }
  }
  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  async function verifyReturn() {
    const params = new URLSearchParams(location.search), reference = params.get("reference") || params.get("trxref");
    if (!reference) return;
    try {
      await request("/premium/verify", { method: "POST", body: JSON.stringify({ reference }) });
      history.replaceState({}, "", location.pathname);
      alertUser("Payment confirmed. Your Premium access or credits have been added.", "success");
    } catch (e) { alertUser(e.message); }
  }
  async function init() {
    if (!token) { location.href = "login.html"; return; }
    $("billing-monthly").addEventListener("click", () => { billingPeriod = "monthly"; renderPlans(); });
    $("billing-yearly").addEventListener("click", () => { billingPeriod = "yearly"; renderPlans(); });
    try {
      await verifyReturn();
      const c = await fetch(API + "/premium/catalog").then(r => r.json());
      if (c.error) throw new Error(c.error);
      catalog = c;
      renderPlans();
      if (!c.paymentsConfigured) alertUser("Checkout is not ready yet. The API administrator must configure Paystack and USD_NGN_EXCHANGE_RATE on Render.");
    } catch (e) {
      alertUser(e.message);
      $("plan-grid").innerHTML = '<div class="loading-card">Could not load plans. Refresh to try again.</div>';
    }
  }
  init();
})();