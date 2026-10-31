(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token") || "";
  if (!token) { location.replace("login.html"); return; }
  async function load() {
    const response = await fetch(API_BASE + "/api/gamification/me", { headers: { Authorization: "Bearer " + token } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); location.replace("login.html"); return; }
    if (!response.ok) throw new Error(data.error || "Could not load your learning profile.");
    $("level-number").textContent = data.level;
    $("level-title").textContent = data.title;
    $("level-xp-total").textContent = Number(data.totalXp).toLocaleString() + " total XP";
    $("level-progress-fill").style.width = data.progressPercent + "%";
    $("level-progress").setAttribute("aria-valuenow", String(data.progressPercent));
    $("level-progress-label").textContent = data.currentLevelXp + " / " + data.xpForNextLevel + " XP in this level";
    $("daily-xp").textContent = data.dailyXp + " / " + data.dailyXpCap;
    $("daily-cap").textContent = "Daily XP allowance";
    $("streak-days").textContent = data.streakDays + (data.streakDays === 1 ? " day" : " days");
    $("xp-to-next").textContent = data.xpToNextLevel;
    const earned = (data.badges || []).filter(badge => badge.earned).length;
    $("badge-count").textContent = earned + " / " + (data.badges || []).length + " earned";
    const badgeGrid = $("badge-grid"); badgeGrid.replaceChildren();
    (data.badges || []).forEach(badge => {
      const card = document.createElement("article"); card.className = "achievement-card" + (badge.earned ? " earned" : "");
      const icon = document.createElement("span"); icon.className = "achievement-icon"; icon.textContent = badge.earned ? "✦" : "◇";
      const title = document.createElement("h3"); title.textContent = badge.name;
      const description = document.createElement("p"); description.textContent = badge.description;
      const status = document.createElement("span"); status.className = "achievement-status"; status.textContent = badge.earned ? "UNLOCKED" : "NOT YET EARNED";
      card.append(icon, title, description, status); badgeGrid.append(card);
    });
    const activity = $("activity-list"); activity.replaceChildren();
    if (!(data.recentActivity || []).length) {
      const empty = document.createElement("p"); empty.className = "level-muted"; empty.textContent = "Complete a quiz or English practice challenge to start building your learning history."; activity.append(empty);
    } else {
      data.recentActivity.forEach(item => {
        const row = document.createElement("article"); row.className = "activity-item";
        const copy = document.createElement("div"); const title = document.createElement("strong"); title.textContent = item.description || "Learning activity";
        const meta = document.createElement("small"); meta.textContent = new Date(item.createdAt).toLocaleString();
        copy.append(title, meta);
        const xp = document.createElement("span"); xp.className = "activity-xp"; xp.textContent = "+" + (item.points || 0) + " XP";
        row.append(copy, xp); activity.append(row);
      });
    }
    $("level-notice").textContent = "Your progress is synced to your account.";
  }
  $("level-signout").addEventListener("click", async () => {
    try { await fetch(API_BASE + "/api/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + token } }); } catch {}
    localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); location.replace("login.html");
  });
  load().catch(error => { $("level-notice").textContent = error.message; $("level-notice").classList.add("error"); });
})();