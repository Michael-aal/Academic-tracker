(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const tokenKey = "academic-tracker-token";
  const signOut = () => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem("academic-tracker-user");
    localStorage.removeItem("academic-tracker-active-quiz");
    window.location.replace("login.html");
  };
  $("signout")?.addEventListener("click", signOut);
  $("mobile-signout")?.addEventListener("click", signOut);
  const pair = (buttonId, menuId) => {
    const button = $(buttonId), menu = $(menuId);
    if (!button || !menu) return;
    button.addEventListener("click", event => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", event => {
      if (!menu.hidden && !menu.contains(event.target) && !button.contains(event.target)) {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { menu.hidden = true; button.setAttribute("aria-expanded", "false"); button.focus(); }
    });
  };
  pair("ai-more-toggle", "ai-more-menu");
  pair("ai-tools-toggle", "ai-tools-menu");
  pair("ai-mobile-menu-toggle", "ai-mobile-menu");
  if (!localStorage.getItem(tokenKey)) window.location.replace("login.html");
})();