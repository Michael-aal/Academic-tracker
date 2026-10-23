(() => {
  "use strict";
  const navTrigger = document.getElementById("navigation-menu-trigger");
  const accountTrigger = document.getElementById("account-menu-trigger");
  const navMenu = document.getElementById("navigation-menu");
  const accountMenu = document.getElementById("account-menu");
  if (!navTrigger || !accountTrigger || !navMenu || !accountMenu) return;
  const pairs = [[navTrigger, navMenu], [accountTrigger, accountMenu]];
  function closeMenus(except = null) {
    pairs.forEach(([trigger, menu]) => {
      if (menu === except) return;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    });
  }
  function toggle(trigger, menu) {
    const shouldOpen = menu.hidden;
    closeMenus(menu);
    menu.hidden = !shouldOpen;
    trigger.setAttribute("aria-expanded", String(shouldOpen));
  }
  navTrigger.addEventListener("click", () => toggle(navTrigger, navMenu));
  accountTrigger.addEventListener("click", () => toggle(accountTrigger, accountMenu));
  document.addEventListener("click", event => {
    if (pairs.some(([trigger, menu]) => trigger.contains(event.target) || menu.contains(event.target))) return;
    closeMenus();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      const opened = pairs.find(([, menu]) => !menu.hidden);
      closeMenus();
      opened?.[0].focus();
    }
  });
  document.addEventListener("click", event => {
    const navItem = event.target.closest("#navigation-menu [data-view]");
    if (navItem) {
      navMenu.querySelectorAll("[data-view]").forEach(item => item.classList.toggle("active", item === navItem));
      closeMenus();
    }
    if (event.target.closest("#quick-add-menu")) {
      document.getElementById("quick-add")?.click();
      closeMenus();
    }
  });
  const sourceAvatar = document.getElementById("profile-shortcut-avatar");
  const targetAvatar = document.getElementById("menu-profile-avatar");
  const targetName = document.getElementById("menu-profile-name");
  try {
    const user = JSON.parse(localStorage.getItem("academic-tracker-user") || "null");
    if (user) {
      const name = String(user.name || "Student");
      if (targetName) targetName.textContent = name;
      if (targetAvatar && sourceAvatar) targetAvatar.textContent = sourceAvatar.textContent;
    }
  } catch {}
})();
