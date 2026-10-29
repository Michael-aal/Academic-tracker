(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  const $ = id => document.getElementById(id);
  const headers = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + token });
  const message = (text, isError = false) => {
    const box = $("subscription-message");
    box.hidden = !text;
    box.textContent = text || "";
    box.style.borderColor = isError ? "var(--money-danger)" : "var(--money-border)";
  };
  async function request(path, options = {}) {
    const response = await fetch(API + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
    return data;
  }
  const escapeText = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
  function renderPlans(data, subscription) {
    const root = $("plans");
    root.innerHTML = "";
    const descriptions = {
      daily: "A short burst of extra study support.",
      weekly: "Extra help for a focused revision week.",
      monthly: "A regular study companion for the month.",
      yearly: "Long-term support across the academic year."
    };
    for (const plan of data.plans || []) {
      const card = document.createElement("article");
      card.className = "money-card" + (plan.code === "monthly" ? " featured" : "");
      const note = plan.checkoutNote || (plan.checkoutAvailable ? "Recurring billing through the configured payment provider." : "Checkout is not configured yet.");
      const disabled = !plan.checkoutAvailable || subscription.isPro;
      card.innerHTML = `
        <h3>${escapeText(plan.name)}</h3>
        <div class="money-price">$ ${escapeText(plan.priceUsd)} <small>/ ${escapeText(plan.code === "yearly" ? "year" : plan.code === "monthly" ? "month" : plan.code === "weekly" ? "week" : "day")}</small></div>
        <p>${escapeText(descriptions[plan.code] || "More room for AI-powered learning.")}</p>
        <ul><li>Higher AI limits</li><li>AI Tutor and quizzes</li><li>Study plans and summaries</li><li>Keep records after expiry</li></ul>
        <button class="money-button ${plan.code === "monthly" ? "primary" : ""}" type="button" data-plan="${escapeText(plan.code)}" ${disabled ? "disabled" : ""}>${subscription.isPro ? "Pro already active" : plan.checkoutAvailable ? "Choose plan" : "Not available yet"}</button>
        <p class="money-note">${escapeText(note)}</p>`;
      const button = card.querySelector("button");
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Preparing secure checkout…";
        try {
          const checkout = await request("/api/subscriptions/checkout", { method: "POST", body: JSON.stringify({ planCode: plan.code }) });
          window.location.assign(checkout.authorizationUrl);
        } catch (error) {
          message(error.message, true);
          button.disabled = false;
          button.textContent = "Choose plan";
        }
      });
      root.appendChild(card);
    }
  }
  function renderUsage(usage) {
    const pro = usage.plan === "PRO";
    $("usage-label").textContent = pro ? "Pro access" : "Free allowance";
    $("usage-description").textContent = pro ? "Higher per-tool daily limits" : "Requests used today";
    $("usage-count").textContent = pro ? (usage.used + " total today") : (usage.used + " / " + usage.limit);
    $("usage-progress").style.width = pro ? "100%" : Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100) + "%";
  }
  function renderHistory(payments) {
    const root = $("billing-history");
    if (!payments?.length) { root.textContent = "No payments yet. Your free trial does not require payment details."; return; }
    root.innerHTML = payments.map(payment => `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--money-border)"><span><strong>${escapeText(payment.planCode)}</strong><br><small class="money-muted">${escapeText(new Date(payment.createdAt).toLocaleDateString())} · ${escapeText(payment.reference)}</small></span><span><strong>${escapeText(payment.currency)} ${(payment.amountMinor / 100).toFixed(2)}</strong><br><small class="money-muted">${escapeText(payment.status)}</small></span></div>`).join("");
  }
  async function load() {
    if (!token) { window.location.replace("login.html?next=subscription.html"); return; }
    try {
      const params = new URLSearchParams(window.location.search);
      const reference = params.get("reference") || params.get("trxref");
      if (params.get("payment") === "return" && reference) {
        message("Checking the payment directly with the server…");
        try { await request("/api/subscriptions/verify", { method: "POST", body: JSON.stringify({ reference }) }); message("Payment verified. Your Pro access has been updated."); }
        catch (error) { message(error.message, true); }
        window.history.replaceState({}, "", window.location.pathname);
      }
      const [plans, account, usage] = await Promise.all([request("/api/subscriptions/plans"), request("/api/subscriptions/me"), request("/api/subscriptions/usage")]);
      const sub = account.subscription;
      $("plan-status").textContent = sub.isPro ? (sub.status === "TRIALING" ? "Pro trial active" : "Pro plan active") : "Free plan";
      if (sub.trialEndsAt) {
        const remaining = Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000));
        $("trial-status").textContent = remaining > 0 ? remaining + " day" + (remaining === 1 ? "" : "s") + " left in your trial" : "Trial ended";
      } else if (sub.currentPeriodEnd) {
        $("trial-status").textContent = (sub.cancelAtPeriodEnd ? "Access ends " : "Renews / ends ") + new Date(sub.currentPeriodEnd).toLocaleDateString();
      } else $("trial-status").textContent = "No payment details needed for Free";
      renderUsage(usage);
      renderPlans(plans, sub);
      renderHistory(account.payments);
      if (sub.isPro && sub.status === "ACTIVE" && !sub.cancelAtPeriodEnd) $("cancel-subscription").hidden = false;
    } catch (error) { message(error.message, true); $("plans").textContent = "Could not load plans. Check your connection and try again."; }
  }
  $("cancel-subscription").addEventListener("click", async () => {
    if (!window.confirm("Turn off renewal? Pro access remains active through the paid period.")) return;
    const button = $("cancel-subscription"); button.disabled = true;
    try { await request("/api/subscriptions/cancel", { method: "POST", body: "{}" }); message("Renewal cancelled. Your current paid access remains available until the period ends."); await load(); }
    catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  load();
})();