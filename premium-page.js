(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "") + "/api";
  const token = localStorage.getItem("academic-tracker-token");
  const $ = id => document.getElementById(id);
  let catalog = { plans: [], bundles: [], fxConfigured: false };
  let state = null;
  let displayCurrency = "USD";
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
  function currencySwitch() {
    $("currency-usd").setAttribute("aria-pressed", String(displayCurrency === "USD"));
    $("currency-ngn").setAttribute("aria-pressed", String(displayCurrency === "NGN"));
    renderPlans(); renderBundles();
  }
  function dailyCard(p) {
    const options = Array.from({ length: 6 }, (_, i) => i + 1)
      .map(days => '<option value="' + days + '">' + days + (days === 1 ? ' day' : ' days') + '</option>').join("");
    return '<article class="plan-card daily-plan-card">' +
      '<p class="plan-kicker">FLEXIBLE ACCESS</p><h3>' + escapeHtml(p.name) + '</h3>' +
      '<div class="price" id="daily-price">' + amountFor(p) + '</div>' +
      '<div class="price-secondary" id="daily-price-secondary">' + alternateAmount(p) + '</div>' +
      '<div class="period">Choose exactly how many days you need</div>' +
      '<label class="daily-select-label" for="daily-days">Access duration</label>' +
      '<select class="daily-days-select" id="daily-days">' + options + '</select>' +
      '<p class="daily-total" id="daily-total" aria-live="polite"></p>' +
      '<p class="credit-note" id="daily-credit-note"></p>' +
      '<button class="premium-buy" data-plan="daily" type="button">Continue to checkout</button>' +
      '<p class="daily-hint">Need 7 days? The Weekly plan is a better-value option.</p></article>';
  }
  function renderPlans() {
    const plans = catalog.plans || [];
    $("plan-grid").innerHTML = plans.length ? plans.map(p => {
      if (p.key === "daily") return dailyCard(p);
      return '<article class="plan-card ' + (p.key === "yearly" ? "featured" : "") + '">' +
        '<h3>' + escapeHtml(p.name) + '</h3><div class="price">' + amountFor(p) + '</div>' +
        '<div class="price-secondary">' + alternateAmount(p) + '</div>' +
        '<div class="period">' + p.durationDays + ' days of Premium access</div>' +
        '<p class="credit-note">' + (p.credits ? p.credits.toLocaleString() + " credits included" : "AI credits can be purchased separately") + '</p>' +
        '<button class="premium-buy" data-plan="' + escapeHtml(p.key) + '" type="button">Choose plan</button></article>';
    }).join("") : '<div class="loading-card">Premium plans are being configured. Please check back soon.</div>';
    document.querySelectorAll("[data-plan]").forEach(b => b.addEventListener("click", () => startPurchase("PLAN", b.dataset.plan)));
    const daily = plans.find(p => p.key === "daily");
    if (daily) {
      $("daily-days").addEventListener("change", updateDailyTotal);
      updateDailyTotal();
    }
  }
  function renderBundles() {
    const bundles = catalog.bundles || [];
    $("bundle-grid").innerHTML = bundles.length ? bundles.map(b =>
      '<article class="bundle-card"><h3>' + escapeHtml(b.name) + '</h3>' +
      '<div class="credits">' + b.credits.toLocaleString() + ' <small>credits</small></div>' +
      '<div class="price">' + amountFor(b) + '</div><div class="price-secondary">' + alternateAmount(b) + '</div>' +
      '<p class="detail">Valid for ' + b.creditValidityDays + ' days</p>' +
      '<button class="premium-buy" data-bundle="' + escapeHtml(b.key) + '" type="button">Buy credits</button></article>'
    ).join("") : '<div class="loading-card">Credit bundles are being configured.</div>';
    document.querySelectorAll("[data-bundle]").forEach(b => b.addEventListener("click", () => startPurchase("BUNDLE", b.dataset.bundle)));
  }
  function updateDailyTotal() {
    const days = Number($("daily-days").value || 1);
    const p = catalog.plans.find(x => x.key === "daily");
    if (!p) return;
    $("daily-price").textContent = amountFor(p, days);
    $("daily-price-secondary").textContent = alternateAmount(p, days);
    $("daily-total").textContent = days + (days === 1 ? " day" : " days") + " · " + (p.credits * days).toLocaleString() + " AI credits included";
    $("daily-credit-note").textContent = "Credits are calculated per day and added after Paystack confirms payment.";
    const button = document.querySelector('[data-plan="daily"]');
    if (button) button.textContent = catalog.fxConfigured && p.amountNgnKobo != null
      ? "Continue · Pay " + ngn(p.amountNgnKobo * days) : "Checkout not configured";
  }
  async function startPurchase(type, key) {
    if (!token) { location.href = "login.html"; return; }
    if (!catalog.fxConfigured) { alertUser("Naira conversion is not configured yet. Please contact support."); return; }
    const body = { type, key };
    if (type === "PLAN" && key === "daily") body.days = Number($("daily-days").value || 1);
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
    $("wallet-expiry").textContent = nextExpiry ? "Next credit expiry: " + new Date(nextExpiry).toLocaleDateString() : "No active credit expiry";
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