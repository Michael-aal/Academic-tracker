/* Shared navigation for all Academic Tracker app routes. */
(() => {
  "use strict";
  if (document.body.classList.contains("at-has-global-navigation")) return;
  document.body.classList.add("at-has-global-navigation");

  const routes = [
    ["Dashboard","dashboard.html","home"],
    ["Subjects","dashboard.html?view=subjects","subjects"],
    ["Scores","dashboard.html?view=scores","scores"],
    ["Reports","dashboard.html?view=reports","reports"],
    ["Calculator","calculator.html","calculator"],
    ["AI Learning","ai-learning.html","learn"],
    ["AI Tutor","ai-tutor.html","tutor"],
    ["AI Quiz","ai-quiz-setup.html","quiz"],
    ["Revision Quiz","quiz.html","quiz-page"],
    ["Educational Videos","educational-videos.html","videos"],
    ["Memory Mastery","memory-mastery.html","memory"],
    ["Study Planner","study-plan.html","planner"],
    ["Notes Summary","notes-summary.html","notes"],
    ["University Dashboard","university-dashboard.html","university"],
    ["Profile","profile.html","profile"],
    ["Support & Messages","support.html","support"]
  ];
  const icons = {
    home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    calculator:'<rect x="4" y="2" width="16" height="20" rx="2"/><rect x="8" y="6" width="8" height="4" rx="1"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    learn:'<path d="M12 18V5"/><path d="M15 13a4 4 0 0 1-3-4 4 4 0 0 1-3 4"/><path d="M18 7a3 3 0 0 0-6-2 3 3 0 0 0-6 2 3 3 0 0 0-1 5 3 3 0 0 0 2 5 3 3 0 0 0 5 2 3 3 0 0 0 5-2 3 3 0 0 0 2-5 3 3 0 0 0-1-5Z"/>',
    quiz:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5M8 16h3"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  const icon = (name) => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (icons[name] || icons.more) + '</svg>';
  const file = location.pathname.split("/").pop() || "dashboard.html";
  if (file.startsWith("admin-")) routes.push(["Admin AI","admin-ai.html","more"],["Admin setup","admin-setup.html","more"],["Admin support","admin-support.html","more"]);
  const authPage = file === "login.html" || file === "register.html";
  const currentTitle = (document.title || "Academic Tracker").replace(/\s*[·|—-]\s*Academic Tracker.*$/i, "").replace(/\s*[·|—-]\s*Academic Tracker$/i, "").trim() || "Workspace";
  const header = document.createElement("header");
  header.className = "at-global-header";
  header.setAttribute("aria-label","Academic Tracker navigation");
  header.innerHTML = `
    <a class="at-nav-brand" href="dashboard.html" aria-label="Academic Tracker home">
      <span class="at-nav-brand-mark" aria-hidden="true">A</span><span class="at-nav-brand-name">Academic <span>Tracker</span></span>
    </a>
    <p class="at-nav-page-title" aria-current="page"></p>
    <div class="at-nav-actions">
      <button class="at-nav-icon-button" id="at-nav-menu-toggle" type="button" aria-label="Open page menu" aria-expanded="false" aria-controls="at-nav-menu">${icon("menu")}</button>
      <button class="at-nav-icon-button" id="at-nav-profile-toggle" type="button" aria-label="Open account menu" aria-expanded="false" aria-controls="at-nav-profile-menu">${icon("user")}</button>
    </div>
    <div class="at-nav-popover at-nav-menu" id="at-nav-menu" hidden>
      <div class="at-nav-menu-heading">Your workspace</div>
      ${routes.map(([label,href]) => `<a href="${href}" data-at-route="${href}">${label}</a>`).join("")}
      <div class="at-nav-menu-separator"></div>
      <a href="index.html">Website home</a>
      ${authPage ? '<a href="login.html">Log in</a><a href="register.html">Create account</a>' : ""}
    </div>
    <div class="at-nav-popover at-nav-menu" id="at-nav-profile-menu" hidden>
      <div class="at-nav-menu-heading">Account</div>
      <a href="profile.html">Profile & settings</a>
      <a href="support.html">Help & support</a>
      ${authPage ? '<a href="login.html">Log in</a><a href="register.html">Create account</a>' : '<button type="button" id="at-nav-signout" class="at-nav-danger">Sign out</button>'}
    </div>`;
  const titleNode = header.querySelector(".at-nav-page-title");
  titleNode.textContent = currentTitle;
  document.body.insertBefore(header, document.body.firstChild);

  // Keep legacy handlers in the DOM, but prevent duplicate headers and navigation.
  document.querySelectorAll("header:not(.at-global-header)").forEach(el => {
    el.classList.add("at-legacy-header");
    el.setAttribute("aria-hidden","true");
  });
  document.querySelectorAll(".sidebar, .mobile-nav, .ai-mobile-menu, .uni-sidebar, .uni-nav").forEach(el => {
    el.classList.add("at-legacy-sidebar");
    el.setAttribute("aria-hidden","true");
  });

  const bottom = document.createElement("nav");
  bottom.className = "at-mobile-nav";
  bottom.setAttribute("aria-label","Primary mobile navigation");
  bottom.innerHTML = `
    <a href="dashboard.html" data-at-bottom="home">${icon("home")}<span class="at-nav-label">Home</span></a>
    <a href="calculator.html" data-at-bottom="calculator">${icon("calculator")}<span class="at-nav-label">Calculator</span></a>
    <a href="ai-learning.html" data-at-bottom="learn">${icon("learn")}<span class="at-nav-label">AI Learn</span></a>
    <a href="ai-quiz-setup.html" data-at-bottom="quiz">${icon("quiz")}<span class="at-nav-label">Quiz</span></a>
    <button type="button" id="at-nav-more-toggle" data-at-bottom="more" aria-label="Open more pages" aria-expanded="false" aria-controls="at-nav-menu">${icon("more")}<span class="at-nav-label">More</span></button>`;
  document.body.appendChild(bottom);

  const menuToggle = header.querySelector("#at-nav-menu-toggle");
  const profileToggle = header.querySelector("#at-nav-profile-toggle");
  const menu = header.querySelector("#at-nav-menu");
  const profileMenu = header.querySelector("#at-nav-profile-menu");
  const moreToggle = bottom.querySelector("#at-nav-more-toggle");
  const setOpen = (target, trigger, open) => {
    target.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  };
  const closeAll = () => {
    setOpen(menu,menuToggle,false);
    setOpen(profileMenu,profileToggle,false);
    moreToggle.setAttribute("aria-expanded","false");
  };
  menuToggle.addEventListener("click", () => {
    const open = menu.hidden;
    closeAll();
    setOpen(menu,menuToggle,open);
    moreToggle.setAttribute("aria-expanded",String(open));
  });
  moreToggle.addEventListener("click", () => {
    const open = menu.hidden;
    closeAll();
    setOpen(menu,menuToggle,open);
    moreToggle.setAttribute("aria-expanded",String(open));
    if (open) menu.scrollTop = 0;
  });
  profileToggle.addEventListener("click", () => {
    const open = profileMenu.hidden;
    closeAll();
    setOpen(profileMenu,profileToggle,open);
  });
  document.addEventListener("click", event => {
    if (!header.contains(event.target) && !bottom.contains(event.target)) closeAll();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeAll();
      if (menuToggle) menuToggle.focus();
    }
  });
  menu.querySelectorAll("a").forEach(a => a.addEventListener("click", closeAll));
  profileMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", closeAll));

  const currentView = new URLSearchParams(location.search).get("view");
  const normalizedFile = file === "ai-tutor.html" ? "ai-learning.html" : file === "quiz.html" ? "ai-quiz-setup.html" : file;
  const bottomTarget = normalizedFile === "dashboard.html" ? "home" :
    normalizedFile === "calculator.html" ? "calculator" :
    normalizedFile === "ai-learning.html" ? "learn" :
    normalizedFile === "ai-quiz-setup.html" ? "quiz" : "more";
  bottom.querySelectorAll("[data-at-bottom]").forEach(el => {
    const active = el.dataset.atBottom === bottomTarget;
    if (active) { el.classList.add("at-nav-active"); el.setAttribute("aria-current","page"); }
  });
  menu.querySelectorAll("[data-at-route]").forEach(a => {
    const target = a.getAttribute("data-at-route");
    const active = target.split("?")[0] === file && (!target.includes("?") || target.endsWith("view=" + currentView));
    if (active) a.setAttribute("aria-current","page");
  });

  // Dashboard section shortcuts use the existing view handlers; preserve their behaviour.
  if (file === "dashboard.html" && currentView) {
    const selectView = () => {
      const control = document.querySelector('[data-view="' + CSS.escape(currentView) + '"]');
      if (control) control.click();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",selectView,{once:true});
    else selectView();
  }

  // Reuse the existing sign-out implementation rather than duplicating auth logic.
  const signOut = header.querySelector("#at-nav-signout");
  if (signOut) {
    const existingSignOut = document.querySelector("#signout, #mobile-signout, #quiz-signout, #signout-button, #logout-button, [data-action='signout']");
    if (!existingSignOut) signOut.hidden = true;
    else signOut.addEventListener("click", () => existingSignOut.click());
  }
})();