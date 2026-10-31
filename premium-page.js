(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "") + "/api";
  const token = localStorage.getItem("academic-tracker-token");
  const $ = id => document.getElementById(id);
  let catalog = { plans: [], bundles: [] };
  let selectedPlan = null;
  let state = null;
  const money = kobo => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(kobo / 100);
  const headers = () => ({ "Content-Type":"application/json", Authorization:"Bearer " + token });
  function alertUser(message,type="error"){const el=$("page-alert");el.textContent=message;el.className="page-alert "+type;el.hidden=false;}
  async function request(path,options={}){const r=await fetch(API+path,{...options,headers:{...headers(),...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Something went wrong.");return data;}
  function renderPlans(){
    $("plan-grid").innerHTML = catalog.plans.length ? catalog.plans.map(p=>`<article class="plan-card ${p.key==="yearly"?"featured":""}"><h3>${escapeHtml(p.name)}</h3><div class="price">${money(p.amountKobo)}</div><div class="period">${p.durationDays} days of Premium access</div><p class="credit-note">${p.credits ? p.credits.toLocaleString()+" credits included" : "AI credits can be purchased separately"}</p><button class="premium-buy" data-plan="${escapeHtml(p.key)}">Choose plan</button></article>`).join("") : '<div class="loading-card">Premium plans are being configured. Please check back soon.</div>';
    document.querySelectorAll("[data-plan]").forEach(b=>b.addEventListener("click",()=>startPurchase("PLAN",b.dataset.plan)));
    const daily=catalog.plans.find(p=>p.key==="daily");$("daily-duration").hidden=!daily;
    updateDailyTotal();
  }
  function renderBundles(){
    $("bundle-grid").innerHTML = catalog.bundles.length ? catalog.bundles.map(b=>`<article class="bundle-card"><h3>${escapeHtml(b.name)}</h3><div class="credits">${b.credits.toLocaleString()} <small>credits</small></div><div class="price">${money(b.amountKobo)}</div><p class="detail">Valid for ${b.creditValidityDays} days</p><button class="premium-buy" data-bundle="${escapeHtml(b.key)}">Buy credits</button></article>`).join("") : '<div class="loading-card">Credit bundles are being configured.</div>';
    document.querySelectorAll("[data-bundle]").forEach(b=>b.addEventListener("click",()=>startPurchase("BUNDLE",b.dataset.bundle)));
  }
  function updateDailyTotal(){const days=Number($("daily-days").value||1),p=catalog.plans.find(x=>x.key==="daily");$("daily-total").textContent=p?money(p.amountKobo*days)+" · "+(p.credits*days).toLocaleString()+" credits":"";}
  async function startPurchase(type,key){
    if(!token){location.href="login.html";return;}
    const body={type,key};if(type==="PLAN"&&key==="daily")body.days=Number($("daily-days").value||1);
    try{document.querySelectorAll(".premium-buy").forEach(b=>b.disabled=true);const result=await request("/premium/initialize",{method:"POST",body:JSON.stringify(body)});if(!result.authorizationUrl)throw new Error("Paystack did not return a checkout link.");location.assign(result.authorizationUrl);}
    catch(e){alertUser(e.message);}finally{document.querySelectorAll(".premium-buy").forEach(b=>b.disabled=false);}
  }
  function renderAccount(){
    if(!state)return;
    const p=state.plan;$("current-plan").textContent=p.active?"Premium · Active":"Free plan";
    const badge=$("subscription-badge");
    badge.textContent=p.active?"PREMIUM ACTIVE":"FREE PLAN";
    badge.classList.toggle("is-premium",Boolean(p.active));
    $("subscription-description").textContent=p.active?"Your Premium membership is active. Enjoy your included benefits until the expiry date below.":"You are currently using the Free plan. Upgrade whenever you need Premium access.";
    $("subscription-period").textContent=p.active?"Plan: "+String(p.key||"Premium").replace(/-/g," ").replace(/\\b\\w/g,x=>x.toUpperCase()):"Plan: Free";
    $("subscription-expiry").textContent=p.active&&p.expiresAt?"Expires: "+new Date(p.expiresAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"Expiry: No active subscription";
    $("credit-balance").textContent=Number(state.credits.balance||0).toLocaleString();
    const nextExpiry=state.credits.lots?.[0]?.expiresAt;
    $("wallet-expiry").textContent=nextExpiry?"Next credit expiry: "+new Date(nextExpiry).toLocaleDateString():"No active credit expiry";
    const cap=Math.max(1000,Number(state.credits.balance||0));$("wallet-meter-fill").style.width=Math.min(100,Number(state.credits.balance||0)/cap*100)+"%";
    if(p.active)$("wallet-expiry").textContent="Premium access until "+new Date(p.expiresAt).toLocaleDateString()+" · "+(nextExpiry?"Next credits expire "+new Date(nextExpiry).toLocaleDateString():"No active credits");
    $("transaction-list").innerHTML=state.transactions.length?state.transactions.map(t=>`<div class="transaction-row"><div><strong>${t.type==="PLAN"?"Premium access":"AI credit top-up"}</strong><small>${escapeHtml(t.itemKey)} · ${new Date(t.createdAt).toLocaleDateString()}</small></div><div class="transaction-amount">${money(t.amountKobo)}<div class="transaction-status">${escapeHtml(t.status)}</div></div></div>`).join(""):'<p class="empty-state">No purchases yet. Your transactions will appear here.</p>';
  }
  function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  async function verifyReturn(){
    const params=new URLSearchParams(location.search),reference=params.get("reference")||params.get("trxref");
    if(!reference)return;
    try{await request("/premium/verify",{method:"POST",body:JSON.stringify({reference})});history.replaceState({}, "",location.pathname);alertUser("Payment confirmed. Your Premium access or credits have been added.","success");}
    catch(e){alertUser(e.message);}
  }
  async function init(){
    if(!token){location.href="login.html";return;}
    $("daily-days").addEventListener("change",updateDailyTotal);
    $("manage-plan-button").addEventListener("click",()=>$("plan-grid").scrollIntoView({behavior:"smooth",block:"start"}));
    try{
      await verifyReturn();
      const [c,a]=await Promise.all([fetch(API+"/premium/catalog").then(r=>r.json()),request("/premium/me")]);
      if(c.error)throw new Error(c.error);catalog=c;state=a;renderPlans();renderBundles();renderAccount();
      if(!c.paymentsConfigured)alertUser("Purchases are not enabled yet. The administrator needs to configure Paystack on the API host.");
    }catch(e){alertUser(e.message);$("plan-grid").innerHTML='<div class="loading-card">Could not load plans. Refresh to try again.</div>';}
  }
  init();
})();