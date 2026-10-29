(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  const $ = id => document.getElementById(id);
  const authHeaders = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const say = (text, bad = false) => { const el = $("packs-message"); el.hidden = !text; el.textContent = text || ""; el.style.borderColor = bad ? "var(--money-danger)" : "var(--money-border)"; };
  async function request(path, options = {}) {
    const response = await fetch(API + path, { ...options, headers: { ...authHeaders, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }
  const escapeText = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
  function renderPacks(packs) {
    const root = $("packs"); root.innerHTML = "";
    if (!packs.length) { root.textContent = "There are no published packs for this education track yet."; return; }
    for (const pack of packs) {
      const card = document.createElement("article"); card.className = "money-card";
      const purchased = pack.purchaseStatus === "PAID";
      const pending = pack.purchaseStatus === "PENDING";
      card.innerHTML = `<span class="money-eyebrow">${escapeText(pack.educationTrack === "HIGHER" ? "UNIVERSITY" : pack.educationTrack === "SECONDARY" ? "SECONDARY SCHOOL" : "ALL STUDENTS")}</span><h3 style="margin-top:12px">${escapeText(pack.title)}</h3><p>${escapeText(pack.description)}</p><div class="money-price">$ ${escapeText(pack.priceUsd)} <small>one-time</small></div><ul><li>Structured revision checklist</li><li>Keep access after purchase</li><li>Separate from Pro subscription</li></ul><button class="money-button ${purchased ? "" : "primary"}" type="button" ${purchased || pending || !pack.checkoutAvailable ? "disabled" : ""}>${purchased ? "In your library" : pending ? "Payment pending" : pack.checkoutAvailable ? "Buy study pack" : "Checkout unavailable"}</button>${!pack.checkoutAvailable && !purchased ? '<p class="money-note">Payment configuration is not ready or the pack price is below the provider minimum.</p>' : ""}`;
      const button = card.querySelector("button");
      if (!purchased && !pending && pack.checkoutAvailable) button.addEventListener("click", async () => {
        button.disabled = true; button.textContent = "Preparing checkout…";
        try { const checkout = await request("/api/study-packs/" + encodeURIComponent(pack.slug) + "/checkout", { method: "POST", body: "{}" }); window.location.assign(checkout.authorizationUrl); }
        catch (error) { say(error.message, true); button.disabled = false; button.textContent = "Buy study pack"; }
      });
      root.appendChild(card);
    }
  }
  function renderLibrary(purchases) {
    const root = $("library"); root.innerHTML = "";
    if (!purchases.length) { root.textContent = "No purchased packs yet. Your library will update after a verified payment."; return; }
    for (const purchase of purchases) {
      const item = document.createElement("article"); item.className = "money-panel"; item.style.marginTop = "12px";
      const pack = purchase.pack || {};
      const sections = Array.isArray(pack.content?.sections) ? pack.content.sections : [];
      item.innerHTML = `<h3>${escapeText(pack.title || "Study pack")}</h3><p class="money-muted">${escapeText(pack.description || "")}</p><div class="pack-content"></div>`;
      const body = item.querySelector(".pack-content");
      for (const section of sections) {
        const sectionEl = document.createElement("section");
        const heading = document.createElement("h4"); heading.textContent = section.title || "Revision section"; sectionEl.appendChild(heading);
        const list = document.createElement("ul");
        for (const text of Array.isArray(section.items) ? section.items : []) { const li = document.createElement("li"); li.textContent = text; list.appendChild(li); }
        sectionEl.appendChild(list); body.appendChild(sectionEl);
      }
      root.appendChild(item);
    }
  }
  async function load() {
    if (!token) { window.location.replace("login.html?next=study-packs.html"); return; }
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (params.get("payment") === "return" && reference) {
      say("Checking your payment with the server…");
      try { await request("/api/subscriptions/verify", { method: "POST", body: JSON.stringify({ reference }) }); say("Payment verified. Your study pack is now in your library."); }
      catch (error) { say(error.message, true); }
      window.history.replaceState({}, "", window.location.pathname);
    }
    try {
      const [catalogue, library] = await Promise.all([request("/api/study-packs"), request("/api/study-packs/purchases")]);
      renderPacks(catalogue.packs || []); renderLibrary(library.purchases || []);
    } catch (error) { say(error.message, true); $("packs").textContent = "Could not load study packs. Please try again."; }
  }
  load();
})();