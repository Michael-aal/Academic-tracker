(() => {
  const link = document.getElementById("profile-shortcut");
  if (!link) return;
  const avatar = document.getElementById("profile-shortcut-avatar");
  const nameEl = document.getElementById("profile-shortcut-name");
  const handleEl = document.getElementById("profile-shortcut-handle");
  function render(user) {
    if (!user) return;
    const name = String(user.name || "Student");
    const email = String(user.email || "");
    const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "A";
    const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "") || "student";
    avatar.textContent = initials;
    nameEl.textContent = name;
    handleEl.textContent = "@" + prefix;
    link.setAttribute("aria-label", "Open profile for " + name);
  }
  try { render(JSON.parse(localStorage.getItem("academic-tracker-user") || "null")); } catch {}
})();