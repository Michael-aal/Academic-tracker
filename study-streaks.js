(() => {
  "use strict";
  const host = document.getElementById("app");
  if (!host) return;

  let user = {};
  try { user = JSON.parse(localStorage.getItem("academic-tracker-user") || "{}"); } catch {}
  const owner = String(user.id || user.userId || user.email || user.username || "offline-guest")
    .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  const STORAGE_KEY = "academic-tracker-streaks-v1:" + owner;
  const DAILY_POINTS = 10;
  const WEEK_STREAK_BONUS = 25;

  const localDateKey = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  };
  const shiftDate = (dateKey, days) => {
    const date = new Date(dateKey + "T12:00:00");
    date.setDate(date.getDate() + days);
    return localDateKey(date);
  };
  const readState = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        points: Math.max(0, Number(value.points) || 0),
        currentStreak: Math.max(0, Number(value.currentStreak) || 0),
        bestStreak: Math.max(0, Number(value.bestStreak) || 0),
        lastCheckIn: typeof value.lastCheckIn === "string" ? value.lastCheckIn : "",
        checkInDates: Array.isArray(value.checkInDates) ? value.checkInDates.filter(v => typeof v === "string") : []
      };
    } catch {
      return { points: 0, currentStreak: 0, bestStreak: 0, lastCheckIn: "", checkInDates: [] };
    }
  };
  let state = readState();
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { console.warn("Could not save study streaks and points on this device.", error); }
  };
  const escaped = value => String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const isCheckedInToday = () => state.lastCheckIn === localDateKey();
  const visibleStreak = () => {
    const today = localDateKey();
    return state.lastCheckIn === today || state.lastCheckIn === shiftDate(today, -1) ? state.currentStreak : 0;
  };
  const render = () => {
    const old = document.getElementById("study-streak-card");
    if (old) old.remove();
    const stats = host.querySelector(".stats-grid");
    if (!stats) return;
    const checkedIn = isCheckedInToday();
    const streak = visibleStreak();
    const card = document.createElement("section");
    card.id = "study-streak-card";
    card.className = "study-streak-card";
    card.setAttribute("aria-labelledby", "study-streak-title");
    card.innerHTML =
      '<div class="streak-intro"><span class="streak-icon" aria-hidden="true">✦</span><div><p class="streak-eyebrow">YOUR STUDY MOMENTUM</p><h2 id="study-streak-title">Build your streak</h2><p class="streak-description">A little focused study each day adds up.</p></div></div>' +
      '<div class="streak-metrics">' +
        '<div class="streak-metric"><span aria-hidden="true">🔥</span><strong>' + streak + '</strong><small>day streak</small></div>' +
        '<div class="streak-metric"><span aria-hidden="true">★</span><strong>' + state.points.toLocaleString() + '</strong><small>total points</small></div>' +
        '<div class="streak-metric"><span aria-hidden="true">🏅</span><strong>' + state.bestStreak + '</strong><small>best streak</small></div>' +
      '</div>' +
      '<div class="streak-action-row"><p class="streak-feedback" role="status">' +
        (checkedIn ? "Today's study check-in is complete. Keep your momentum going!" : "Check in after you study to earn " + DAILY_POINTS + " points.") +
      '</p><button type="button" class="button ' + (checkedIn ? "secondary" : "primary") + '" id="study-checkin-button" ' + (checkedIn ? "disabled" : "") + '>' +
        (checkedIn ? "✓ Checked in today" : "Complete daily check-in · +" + DAILY_POINTS + " pts") +
      '</button></div>' +
      '<p class="streak-rule">Reach a 7-day streak for a ' + WEEK_STREAK_BONUS + '-point bonus. Points and streaks are saved on this device.</p>';
    stats.insertAdjacentElement("afterend", card);
    card.querySelector("#study-checkin-button").addEventListener("click", () => {
      const today = localDateKey();
      if (state.lastCheckIn === today) return;
      const yesterday = shiftDate(today, -1);
      state.currentStreak = state.lastCheckIn === yesterday ? state.currentStreak + 1 : 1;
      state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
      state.points += DAILY_POINTS;
      if (state.currentStreak > 0 && state.currentStreak % 7 === 0) state.points += WEEK_STREAK_BONUS;
      state.lastCheckIn = today;
      if (!state.checkInDates.includes(today)) state.checkInDates.push(today);
      state.checkInDates = state.checkInDates.slice(-400);
      save();
      render();
    });
  };

  let renderQueued = false;
  const observer = new MutationObserver(() => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  });
  observer.observe(host, { childList: true, subtree: true });
  render();
})();