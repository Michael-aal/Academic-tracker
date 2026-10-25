(() => {
  "use strict";
  const file = (location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  if (file === "dashboard.html") return;

  const labels = {
    "ai-learning.html": "AI learning",
    "memory-mastery.html": "Memory Mastery",
    "educational-videos.html": "Educational videos",
    "university-dashboard.html": "University tracking",
    "profile.html": "My profile",
    "support.html": "Support inbox",
    "admin-support.html": "Admin messages",
    "admin-ai.html": "AI service status"
  };
  const currentLabel = labels[file] || "Academic workspace";
  let user = null;
  try { user = JSON.parse(localStorage.getItem("academic-tracker-user") || "null"); } catch {}
  const admin = Boolean(user && user.isAdmin);
  const entries = [
    { group: "YOUR WORKSPACE", href: "dashboard.html", label: "Dashboard", icon: "⌂", key: "dashboard" },
    { href: "dashboard.html?view=scores", label: "Score entry", icon: "▤", key: "scores" },
    { href: "dashboard.html?view=subjects", label: "Subjects", icon: "◈", key: "subjects" },
    { href: "dashboard.html?view=reports", label: "Reports", icon: "▥", key: "reports" },
    { href: "dashboard.html?view=settings", label: "Backup & settings", icon: "⚙", key: "settings" },
    { group: "LEARNING TOOLS", href: "ai-learning.html", label: "AI learning", icon: "✦", key: "ai-learning.html" },
    { href: "educational-videos.html", label: "Educational videos", icon: "▷", key: "educational-videos.html" },
    { href: "memory-mastery.html", label: "Memory Mastery", icon: "◎", key: "memory-mastery.html" },
    { href: "university-dashboard.html", label: "University tracking", icon: "◫", key: "university-dashboard.html" },
    { href: "university-dashboard.html#courses", label: "My courses", icon: "↳", key: "university-courses" },
    { href: "university-dashboard.html#results", label: "Semester results", icon: "↳", key: "university-results" },
    { group: "ACCOUNT", href: "profile.html", label: "My profile", icon: "◉", key: "profile.html" },
    { href: admin ? "admin-support.html" : "support.html", label: admin ? "Admin messages" : "Support inbox", icon: "✉", key: admin ? "admin-support.html" : "support.html" }
  ];
  if (admin) {
    entries.push({ group: "ADMINISTRATION", href: "admin-ai.html", label: "AI service status", icon: "⌁", key: "admin-ai.html" });
  }
  const view = new URLSearchParams(location.search).get("view") || "dashboard";
  const activeKey = file === "dashboard.html" ? view : file;
  const menuItems = entries.map(item => {
    const group = item.group ? '<p class="workspace-menu-group">' + item.group + '</p>' : "";
    const active = item.key === activeKey || (item.key === "university-courses" && file === "university-dashboard.html" && location.hash === "#courses") || (item.key === "university-results" && file === "university-dashboard.html" && location.hash === "#results");
    const current = active ? ' aria-current="page"' : "";
    return group + '<a class="workspace-menu-item' + (active ? ' is-active' : '') + '" href="' + item.href + '"' + current + '><span class="workspace-menu-icon" aria-hidden="true">' + item.icon + '</span><span>' + item.label + '</span>' + (active ? '<span class="workspace-current-mark" aria-hidden="true">✓</span>' : '') + '</a>';
  }).join("");

  document.body.classList.add("workspace-nav-enabled");
  const topbar = document.createElement("header");
  topbar.className = "workspace-topbar";
  topbar.innerHTML =
    '<div class="workspace-topbar-inner">' +
      '<button class="workspace-menu-trigger" type="button" aria-label="Open workspace menu" aria-expanded="false" aria-controls="workspace-navigation-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>' +
      '<a class="workspace-brand" href="dashboard.html" aria-label="Academic Tracker dashboard"><span class="workspace-brand-mark">A</span><span>Academic<span> Tracker</span></span></a>' +
      '<span class="workspace-page-label">' + currentLabel + '</span>' +
      '<a class="workspace-profile-trigger" href="profile.html" aria-label="Open my profile"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.3 3.2-5 7-5s6.3 1.7 7 5"/></svg></a>' +
    '</div>' +
    '<div class="workspace-menu-panel" id="workspace-navigation-menu" hidden><div class="workspace-menu-head"><div><span class="workspace-menu-kicker">ACADEMIC TRACKER</span><strong>Jump to a page</strong></div><span class="workspace-menu-count">' + entries.length + ' destinations</span></div>' +
      '<nav aria-label="All workspace pages">' + menuItems + '</nav>' +
      '<div class="workspace-menu-footer"><span class="workspace-online-dot"></span><span>Your workspace, all in one place</span><button class="workspace-signout" type="button">Sign out</button></div>' +
    '</div>';
  document.body.insertBefore(topbar, document.body.firstChild);

  const trigger = topbar.querySelector(".workspace-menu-trigger");
  const menu = topbar.querySelector(".workspace-menu-panel");
  const closeMenu = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
  trigger.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", event => {
    if (!topbar.contains(event.target)) closeMenu();
    const link = event.target.closest(".workspace-menu-item");
    if (link) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) { closeMenu(); trigger.focus(); }
  });
  topbar.querySelector(".workspace-signout").addEventListener("click", () => {
    localStorage.removeItem("academic-tracker-token");
    localStorage.removeItem("academic-tracker-user");
    location.replace("index.html");
  });

  const mobileNav = document.createElement("nav");
  mobileNav.className = "workspace-mobile-nav";
  mobileNav.setAttribute("aria-label", "Quick navigation");
  const quick = [
    { label: "Home", icon: "⌂", href: "dashboard.html", active: file === "dashboard.html" },
    { label: "Scores", icon: "▤", href: "dashboard.html?view=scores", active: file === "dashboard.html" && view === "scores" },
    { label: "Subjects", icon: "◈", href: "dashboard.html?view=subjects", active: file === "dashboard.html" && view === "subjects" },
    { label: "Reports", icon: "▥", href: "dashboard.html?view=reports", active: file === "dashboard.html" && view === "reports" }
  ];
  mobileNav.innerHTML = quick.map(item => '<a href="' + item.href + '"' + (item.active ? ' aria-current="page"' : '') + '><span aria-hidden="true">' + item.icon + '</span><small>' + item.label + '</small></a>').join("") +
    '<button type="button" class="workspace-mobile-more" aria-label="Open all pages menu"><span aria-hidden="true">☰</span><small>More</small></button>';
  document.body.appendChild(mobileNav);
  mobileNav.querySelector("button").addEventListener("click", () => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.focus({ preventScroll: true });
    topbar.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();