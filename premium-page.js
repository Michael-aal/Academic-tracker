(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "") + "/api";
  const token = localStorage.getItem("academic-tracker-token");
  const $ = id => document.getElementById(id);
  let catalog = { plans: [], bundles: [], fxConfigured: false };
  let state = null;
  let displayCurrency = "USD";
  let billingPeriod = "monthly";
  const usd = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
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
  function alternateAmount(item, multiplier = 1) {
    return displayCurrency === "USD"
      ? (item.amountNgnKobo != null ? "≈ " + ngn(item.amountNgnKobo * multiplier) : "Naira conversion unavailable")
      : usd(item.amountUsdCents * multiplier);
  }
  function checkoutReady(item) { return Boolean(catalog.paymentsConfigured && catalog.fxConfigured && item?.amountNgnKobo != null); }
  function currencySwitch() {
    $("currency-usd").setAttribute("aria-pressed", String(displayCurrency === "USD"));
    $("currency-ngn").setAttribute("aria-pressed", String(displayCurrency === "NGN"));
    renderPlans(); renderBundles();
  }
  function renderPlans() {
    const plans = catalog.plans || [];
    const monthly = plans.find(p => p.key === "monthly");
    const yearly = plans.find(p => p.key === "yearly");
    const selected = billingPeriod === "yearly" ? yearly : monthly;
    const freeCredits = state?.credits?.freeAllowance;
    const freeCreditText = freeCredits
      ? Number(freeCredits.amount || 0).toLocaleString() + " free AI credits refreshed every " + (freeCredits.refreshHours / 24) + " days"
      : "Free AI credits with periodic refreshes";
    const freeCard = '<article class="plan-card free-plan-card">' +
      '<p class="plan-kicker">GET STARTED</p><h3>Free</h3>' +
      '<div class="price">₦0</div><div class="price-secondary">Forever free · No payment required</div>' +
      '<ul class="plan-features"><li>Core academic tracking tools</li><li>Access to essential study features</li><li>' + escapeHtml(freeCreditText) + '</li></ul>' +
      '<button class="premium-buy free-plan-button" type="button" disabled>Free plan</button></article>';
    const premiumCard = selected
      ? '<article class="plan-card featured premium-plan-card">' +
        '<p class="plan-kicker">UNLOCK MORE</p><h3>Premium</h3>' +
        '<div class="price">' + amountFor(selected) + '</div>' +
        '<div class="price-secondary">' + alternateAmount(selected) + '</div>' +
        '<div class="period">One-time payment for ' + selected.durationDays + ' days. Pay the full amount upfront.</div>' +
        '<ul class="plan-features"><li>Premium access for the full selected period</li><li>' + (selected.credits ? selected.credits.toLocaleString() + ' AI credits included' : 'AI credit bundles available separately') + '</li><li>Use Premium learning tools during your active period</li></ul>' +
        '<button class="premium-buy" data-plan="' + escapeHtml(selected.key) + '" type="button"' + (checkoutReady(selected) ? '' : ' disabled') + '>' +
        (checkoutReady(selected) ? 'Pay ' + amountFor(selected) + ' · Continue' : 'Checkout unavailable') + '</button>' +
        '</article>'
      : '<div class="loading-card">The ' + billingPeriod + ' Premium option is not configured yet.</div>';
    $("plan-grid").innerHTML = freeCard + premiumCard;
    $("billing-monthly").setAttribute("aria-pressed", String(billingPeriod === "monthly"));
    $("billing-yearly").setAttribute("aria-pressed", String(billingPeriod === "yearly"));
    document.querySelectorAll("[data-plan]").forEach(b => b.addEventListener("click", () => startPurchase("PLAN", b.dataset.plan)));
  }
  function renderBundles() {
    const bundles = catalog.bundles || [];
    $("bundle-grid").innerHTML = bundles.length ? bundles.map(b =>
      '<article class="bundle-card"><h3>' + escapeHtml(b.name) + '</h3>' +
      '<div class="credits">' + b.credits.toLocaleString() + ' <small>credits</small></div>' +
      '<div class="price">' + amountFor(b) + '</div><div class="price-secondary">' + alternateAmount(b) + '</div>' +
      '<p class="detail">Valid for ' + b.creditValidityDays + ' days</p>' +
      '<button class="premium-buy" data-bundle="' + escapeHtml(b.key) + '" type="button"' + (checkoutReady(b) ? "" : " disabled") + '>' + (checkoutReady(b) ? "Buy · Pay " + ngn(b.amountNgnKobo) : "Checkout unavailable") + '</button></article>'
    ).join("") : '<div class="loading-card">Credit bundles are being configured.</div>';
    document.querySelectorAll("[data-bundle]").forEach(b => b.addEventListener("click", () => startPurchase("BUNDLE", b.dataset.bundle)));
  }
  function updateDailyTotal() {
    const days = Number($("daily-days").value || dailyDays || 1);
    dailyDays = days;
    const p = catalog.plans.find(x => x.key === "daily");
    if (!p) return;
    $("daily-price").textContent = amountFor(p, days);
    $("daily-price-secondary").textContent = alternateAmount(p, days);
    $("daily-total").textContent = days + (days === 1 ? " day" : " days") + " · " + (p.credits * days).toLocaleString() + " AI credits included";
    $("daily-credit-note").textContent = "Credits are calculated per day and added after Paystack confirms payment.";
    const button = document.querySelector('[data-plan="daily"]');
    if (button) {
      button.disabled = !checkoutReady(p);
      button.textContent = checkoutReady(p) ? "Continue · Pay " + ngn(p.amountNgnKobo * days) : "Checkout unavailable";
    }
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
  function renderAccount() {
    if (!state) return;
    const p = state.plan;
    $("current-plan").textContent = p.active ? "Premium · Active" : "Free plan";
    const badge = $("subscription-badge");
    badge.textContent = p.active ? "PREMIUM ACTIVE" : "FREE PLAN";
    badge.classList.toggle("is-premium", Boolean(p.active));
    $("subscription-description").textContent = p.active
      ? "Your Premium membership is active. Enjoy your included benefits until the expiry date below."
      : "You are currently using the Free plan. Upgrade whenever you need Premium access.";
    $("subscription-period").textContent = p.active ? "Plan: " + String(p.key || "Premium").replace(/-/g, " ").replace(/\b\w/g, x => x.toUpperCase()) : "Plan: Free";
    $("subscription-expiry").textContent = p.active && p.expiresAt
      ? "Expires: " + new Date(p.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "Expiry: No active subscription";
    $("credit-balance").textContent = Number(state.credits.balance || 0).toLocaleString();
    const nextExpiry = state.credits.lots?.[0]?.expiresAt;
    const freeRefresh = state.credits.freeAllowance?.nextRefreshAt;
    $("wallet-expiry").textContent = !p.active && freeRefresh
      ? "Next free refill: " + new Date(freeRefresh).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + " · Free credits expire after 72 hours"
      : nextExpiry ? "Next credit expiry: " + new Date(nextExpiry).toLocaleDateString() : "No active credit expiry";
    const costs = state.creditPolicy?.costs || {};
    $("credit-costs").textContent = "Per request: Tutor " + (costs.tutor ?? 2) + " · Quiz " + (costs.quiz ?? 3) + " · Notes " + (costs.summarize ?? 2) + " · Study plan " + (costs["study-plan"] ?? 2) + " · Flashcards " + (costs.flashcards ?? 2) + " credits";
    const cap = Math.max(1000, Number(state.credits.balance || 0));
    $("wallet-meter-fill").style.width = Math.min(100, Number(state.credits.balance || 0) / cap * 100) + "%";
    if (p.active) $("wallet-expiry").textContent = "Premium access until " + new Date(p.expiresAt).toLocaleDateString() + " · " + (nextExpiry ? "Next credits expire " + new Date(nextExpiry).toLocaleDateString() : "No active credits");
    $("transaction-list").innerHTML = state.transactions.length ? state.transactions.map(t =>
      '<div class="transaction-row"><div><strong>' + (t.type === "PLAN" ? "Premium access" : "AI credit top-up") + '</strong>' +
      '<small>' + escapeHtml(t.itemKey) + ' · ' + new Date(t.createdAt).toLocaleDateString() + '</small></div>' +
      '<div class="transaction-amount">' + (t.baseAmountUsdCents > 0 ? usd(t.baseAmountUsdCents) + '<small class="transaction-conversion">Paid ' + ngn(t.amountKobo) + '</small>' : ngn(t.amountKobo)) +
      '<div class="transaction-status">' + escapeHtml(t.status) + '</div></div></div>'
    ).join("") : '<p class="empty-state">No purchases yet. Your transactions will appear here.</p>';
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
    $("currency-usd").addEventListener("click", () => { displayCurrency = "USD"; currencySwitch(); });
    $("currency-ngn").addEventListener("click", () => { displayCurrency = "NGN"; currencySwitch(); });
    $("billing-monthly").addEventListener("click", () => { billingPeriod = "monthly"; renderPlans(); });
    $("billing-yearly").addEventListener("click", () => { billingPeriod = "yearly"; renderPlans(); });
    $("manage-plan-button").addEventListener("click", () => $("plan-grid").scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      await verifyReturn();
      const [c, a] = await Promise.all([fetch(API + "/premium/catalog").then(r => r.json()), request("/premium/me")]);
      if (c.error) throw new Error(c.error);
      catalog = c; state = a;
      renderPlans(); renderBundles(); renderAccount(); currencySwitch();
      if (!c.paymentsConfigured) alertUser("Checkout is not ready yet. The API administrator must configure Paystack and USD_NGN_EXCHANGE_RATE on Render.");
    } catch (e) {
      alertUser(e.message);
      $("plan-grid").innerHTML = '<div class="loading-card">Could not load plans. Refresh to try again.</div>';
    }
  }
  init();
})();