(() => {
  "use strict";
  const token = localStorage.getItem("academic-tracker-token");
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  if (!token) { window.location.replace("login.html"); return; }
  const $ = id => document.getElementById(id);
  let user = {};
  try { user = JSON.parse(localStorage.getItem("academic-tracker-user") || "{}"); } catch {}
  const owner = String(user.id || user.userId || user.email || user.username || "signed-in-account").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  const STORAGE_KEY = "academic-tracker-memory-v1:" + owner;
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
  let cards = loadCards();
  let editingId = null;
  let queue = [];
  let current = null;
  let answerRevealed = false;
  let reviewStats = loadStats();

  function loadCards() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(c => c && typeof c.id === "string" && typeof c.question === "string" && typeof c.answer === "string") : [];
    } catch { return []; }
  }
  function loadStats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY + ":stats") || "{}");
      return { reviewed: Number(parsed.reviewed) || 0, correct: Number(parsed.correct) || 0 };
    } catch { return { reviewed: 0, correct: 0 }; }
  }
  let serverCardIds = new Set();
  async function dataRequest(path, options = {}) {
    const response = await fetch(API_BASE + path, { ...options, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); location.replace("login.html"); throw new Error("Your session expired. Please sign in again."); }
    if (!response.ok) throw new Error(data.error || "Could not sync Memory Mastery.");
    return data;
  }
  async function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    localStorage.setItem(STORAGE_KEY + ":stats", JSON.stringify(reviewStats));
    try {
      for (let index = 0; index < cards.length; index += 20) {
        const batch = cards.slice(index, index + 20);
        await dataRequest("/api/user-data/memory-cards/bulk", { method: "PUT", body: JSON.stringify({ records: batch.map(card => ({ recordId: card.id, data: card })) }) });
      }
      const ids = new Set(cards.map(card => card.id));
      const removed = [...serverCardIds].filter(id => !ids.has(id));
      for (let index = 0; index < removed.length; index += 100) {
        await dataRequest("/api/user-data/memory-cards/bulk", { method: "DELETE", body: JSON.stringify({ recordIds: removed.slice(index, index + 100) }) });
      }
      await dataRequest("/api/user-data/memory-stats/summary", { method: "PUT", body: JSON.stringify({ data: reviewStats }) });
      serverCardIds = ids;
      $("form-notice").textContent = "Your memory cards and review progress are synced to your account.";
    } catch (error) {
      console.error("Memory Mastery account sync failed", error);
      $("form-notice").textContent = "Saved locally, but account sync failed. Check your connection before switching devices.";
    }
  }
  async function syncFromAccount() {
    const [cardData, statsData] = await Promise.all([dataRequest("/api/user-data/memory-cards"), dataRequest("/api/user-data/memory-stats")]);
    const remoteCards = Array.isArray(cardData.records) ? cardData.records : [];
    const deletedIds = new Set(Array.isArray(cardData.deletedIds) ? cardData.deletedIds : []);
    serverCardIds = new Set(remoteCards.map(record => record.recordId));
    const byId = new Map(remoteCards.map(record => [record.recordId, record.data]));
    for (const card of cards) if (!byId.has(card.id) && !deletedIds.has(card.id)) byId.set(card.id, card);
    cards = [...byId.values()];
    const remoteStats = statsData.records?.find(record => record.recordId === "summary")?.data;
    if (remoteStats) reviewStats = { reviewed: Number(remoteStats.reviewed) || 0, correct: Number(remoteStats.correct) || 0 };
    else await dataRequest("/api/user-data/memory-stats/summary", { method: "PUT", body: JSON.stringify({ data: reviewStats }) });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    localStorage.setItem(STORAGE_KEY + ":stats", JSON.stringify(reviewStats));
    const localOnly = cards.filter(card => !serverCardIds.has(card.id) && !deletedIds.has(card.id));
    for (let index = 0; index < localOnly.length; index += 20) {
      const batch = localOnly.slice(index, index + 20);
      await dataRequest("/api/user-data/memory-cards/bulk", { method: "PUT", body: JSON.stringify({ records: batch.map(card => ({ recordId: card.id, data: card })) }) });
    }
    localOnly.forEach(card => serverCardIds.add(card.id));
  }
  function now() { return Date.now(); }
  function dueAt(card) { return Number(card.dueAt) || 0; }
  function isDue(card) { return dueAt(card) <= now(); }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch])); }
  function dateLabel(timestamp) {
    if (!timestamp) return "Due now";
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function updateStats() {
    const due = cards.filter(isDue).length;
    $("stat-total").textContent = cards.length;
    $("stat-due").textContent = due;
    $("stat-mastered").textContent = cards.filter(c => (Number(c.repetitions) || 0) >= 5).length;
    $("stat-accuracy").textContent = reviewStats.reviewed ? Math.round(reviewStats.correct / reviewStats.reviewed * 100) + "%" : "—";
    $("stat-reviewed").textContent = reviewStats.reviewed ? reviewStats.reviewed + " reviews recorded" : "No reviews yet";
    $("queue-count").textContent = due + " due";
  }
  function renderLibrary() {
    const query = $("library-search").value.trim().toLowerCase();
    const list = $("library-list");
    const visible = cards.filter(c => [c.subject, c.topic, c.question, c.answer].some(v => String(v || "").toLowerCase().includes(query)));
    list.innerHTML = visible.map(card => {
      const next = dueAt(card) <= now() ? "Due now" : "Next: " + dateLabel(card.dueAt);
      const topic = card.topic ? " · " + escapeHTML(card.topic) : "";
      return '<article class="mm-library-card"><div><div class="mm-library-meta"><span>' + escapeHTML(card.subject || "General") + topic + '</span><span>' + next + '</span><span>' + (Number(card.repetitions)||0) + ' successful reviews</span></div><h3>' + escapeHTML(card.question) + '</h3><p>' + escapeHTML(card.answer) + '</p></div><div class="mm-card-actions"><button class="mm-secondary" data-edit="' + escapeHTML(card.id) + '" type="button">Edit</button><button class="mm-secondary" data-delete="' + escapeHTML(card.id) + '" type="button">Delete</button></div></article>';
    }).join("");
    $("library-empty").hidden = visible.length > 0;
    if (cards.length && !visible.length) { $("library-empty").hidden = false; $("library-empty").querySelector("h3").textContent = "No matching cards"; $("library-empty").querySelector("p").textContent = "Try another search term."; }
    else { $("library-empty").querySelector("h3").textContent = "Your library starts with you"; $("library-empty").querySelector("p").textContent = "Cards you create will appear here. No sample cards or made-up progress are included."; }
    updateStats();
  }
  function buildQueue() {
    queue = cards.filter(isDue).sort((a,b) => dueAt(a) - dueAt(b));
    current = null;
    showNext();
  }
  function showNext() {
    current = queue.shift() || null;
    answerRevealed = false;
    $("answer-area").hidden = true;
    $("reveal-answer").hidden = false;
    if (!current) {
      $("review-stage").hidden = true;
      $("empty-review").hidden = false;
      $("empty-review").querySelector("h3").textContent = cards.length ? "You're all caught up" : "Your review queue is clear";
      $("empty-review").querySelector("p").textContent = cards.length ? "Great work. Your next reviews will appear here when they are due. You can add more cards while the material is fresh." : "Add your first card or come back when a review is due. Your queue uses real cards saved in this browser.";
      $("queue-count").textContent = "0 due";
      updateStats();
      return;
    }
    $("review-stage").hidden = false;
    $("empty-review").hidden = true;
    $("review-subject").textContent = current.subject || "General";
    $("review-progress").textContent = "Review " + (cards.filter(isDue).length - queue.length) + " of " + cards.filter(isDue).length;
    $("review-question").textContent = current.question;
    $("review-topic").textContent = current.topic || "Try to explain the answer before revealing it.";
    $("review-answer").textContent = current.answer;
    $("queue-count").textContent = (queue.length + 1) + " left";
  }
  $("generate-cards-form").addEventListener("submit", async event => {
    event.preventDefault();
    const subject = $("ai-card-subject").value.trim();
    const topic = $("ai-card-topic").value.trim();
    const content = $("ai-card-notes").value.trim();
    const cardCount = Number($("ai-card-count").value);
    const button = $("generate-cards-button");
    const status = $("ai-generation-status");
    if (!subject || !topic) { status.textContent = "Enter a subject and topic first."; return; }
    if (!content && topic.length < 2) { status.textContent = "Add a topic or some class notes."; return; }
    button.disabled = true;
    button.textContent = "Generating cards…";
    status.textContent = "Asking AI to prepare your memory cards…";
    try {
      const response = await fetch(API_BASE + "/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ action: "flashcards", subject, topic, content, cardCount, level: user.educationTrack === "HIGHER" ? "higher institution / university" : "secondary school" })
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        localStorage.removeItem("academic-tracker-token");
        localStorage.removeItem("academic-tracker-user");
        window.location.replace("login.html");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not generate memory cards.");
      if (!Array.isArray(data.cards) || data.cards.length !== cardCount || data.cards.some(card => !card || typeof card.question !== "string" || typeof card.answer !== "string")) {
        throw new Error("The AI response was incomplete. No cards were added; please try again.");
      }
      const timestamp = now();
      const generated = data.cards.map((card, index) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : String(timestamp + index) + Math.random().toString(16).slice(2),
        subject, topic, question: card.question.trim(), answer: card.answer.trim(),
        createdAt: timestamp, dueAt: timestamp, repetitions: 0, intervalDays: 0,
        lastReviewedAt: null, lastRating: null
      }));
      const knownQuestions = new Set(cards.map(card => card.question.trim().toLocaleLowerCase()));
      const uniqueGenerated = generated.filter(card => !knownQuestions.has(card.question.toLocaleLowerCase()));
      if (!uniqueGenerated.length) throw new Error("These questions already exist in your library. Try a different topic or notes.");
      cards.unshift(...uniqueGenerated);
      persist();
      buildQueue();
      renderLibrary();
      $("ai-card-notes").value = "";
      status.textContent = "Added " + uniqueGenerated.length + " AI-generated card(s) to your library. Check the answers and edit anything that needs correction.";
    } catch (error) {
      status.textContent = error.message || "Could not generate memory cards. Please try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Generate cards with AI";
    }
  });

  function addCard(values) {
    cards.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(now()) + Math.random().toString(16).slice(2), subject: values.subject.trim(), topic: values.topic.trim(), question: values.question.trim(), answer: values.answer.trim(), createdAt: now(), dueAt: now(), repetitions: 0, intervalDays: 0, lastReviewedAt: null, lastRating: null });
    persist(); buildQueue(); renderLibrary();
  }
  $("card-form").addEventListener("submit", event => {
    event.preventDefault();
    const values = { subject: $("card-subject").value, topic: $("card-topic").value, question: $("card-question").value, answer: $("card-answer").value };
    if (!values.subject.trim() || !values.question.trim() || !values.answer.trim()) {
      $("form-notice").textContent = "Please add a subject, question, and answer."; return;
    }
    if (editingId) {
      const existing = cards.find(card => card.id === editingId);
      if (existing) { existing.subject = values.subject.trim(); existing.topic = values.topic.trim(); existing.question = values.question.trim(); existing.answer = values.answer.trim(); }
      editingId = null;
      $("save-card-button").textContent = "＋ Save memory card";
      persist(); buildQueue(); renderLibrary();
      $("form-notice").textContent = "Memory card updated. Syncing your changes to your account…";
    } else {
      addCard(values);
      $("form-notice").textContent = "Memory card added. Syncing it to your account… Try recalling it before revealing the answer.";
    }
    $("card-form").reset();
    $("review-stage").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("reveal-answer").addEventListener("click", () => {
    if (!current) return;
    answerRevealed = true;
    $("answer-area").hidden = false;
    $("reveal-answer").hidden = true;
  });
  document.querySelectorAll("[data-rating]").forEach(button => button.addEventListener("click", () => {
    if (!current || !answerRevealed) return;
    const rating = button.dataset.rating;
    const reviewedCardId = current.id;
    current.lastReviewedAt = now();
    current.lastRating = rating;
    reviewStats.reviewed += 1;
    if (rating === "again") {
      current.repetitions = 0; current.intervalDays = 0; current.dueAt = now() + 10 * 60 * 1000;
    } else {
      reviewStats.correct += 1;
      let reps = Number(current.repetitions) || 0;
      if (rating === "hard") {
        current.intervalDays = Math.max(1, Math.round((Number(current.intervalDays) || 1) * 1.2));
        current.repetitions = reps + 1;
      } else if (rating === "good") {
        current.intervalDays = INTERVALS[Math.min(INTERVALS.length - 1, reps + 1)];
        current.repetitions = reps + 1;
      } else {
        current.intervalDays = INTERVALS[Math.min(INTERVALS.length - 1, reps + 2)];
        current.repetitions = reps + 2;
      }
      current.dueAt = now() + current.intervalDays * 24 * 60 * 60 * 1000;
    }
    persist().then(() => { if (rating !== "again") dataRequest("/api/learning/progress/award", { method: "POST", body: JSON.stringify({ action: "flashcard-reviewed", reference: reviewedCardId }) }).catch(() => {}); }); renderLibrary(); showNext();
  }));
  $("library-search").addEventListener("input", renderLibrary);
  $("library-list").addEventListener("click", event => {
    const editId = event.target.closest("[data-edit]")?.dataset.edit;
    const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
    if (editId) {
      const card = cards.find(c => c.id === editId); if (!card) return;
      editingId = card.id;
      $("card-subject").value = card.subject || ""; $("card-topic").value = card.topic || "";
      $("card-question").value = card.question; $("card-answer").value = card.answer;
      $("save-card-button").textContent = "Save card changes";
      $("form-notice").textContent = "Editing this card. Its review schedule will be preserved when you save.";
      $("add-card").scrollIntoView({ behavior: "smooth" }); $("card-question").focus();
    } else if (deleteId) {
      const card = cards.find(c => c.id === deleteId); if (!card) return;
      if (!window.confirm("Delete this memory card? This cannot be undone unless you exported a backup.")) return;
      cards = cards.filter(c => c.id !== deleteId); persist(); buildQueue(); renderLibrary();
    }
  });
  document.querySelectorAll("[data-scroll-form]").forEach(button => button.addEventListener("click", () => { $("add-card").scrollIntoView({ behavior: "smooth" }); $("card-subject").focus(); }));
  $("export-cards").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version: 1, cards, reviewStats }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "academic-tracker-memory-backup.json"; link.click(); URL.revokeObjectURL(url);
  });
  $("import-cards").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async () => {
    const file = $("import-file").files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Backup must be smaller than 2 MB.");
      const parsed = JSON.parse(await file.text());
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.cards)) throw new Error("This is not a valid Memory Mastery backup.");
      const valid = parsed.cards.filter(c => c && typeof c.question === "string" && typeof c.answer === "string" && typeof c.subject === "string").map(c => ({ id: String(c.id || now() + Math.random()), subject: c.subject.slice(0,80), topic: String(c.topic || "").slice(0,120), question: c.question.slice(0,700), answer: c.answer.slice(0,1800), createdAt: Number(c.createdAt)||now(), dueAt: Number(c.dueAt)||now(), repetitions: Math.max(0, Number(c.repetitions)||0), intervalDays: Math.max(0, Number(c.intervalDays)||0), lastReviewedAt: Number(c.lastReviewedAt)||null, lastRating: c.lastRating || null }));
      if (!valid.length) throw new Error("No valid memory cards were found in that backup.");
      if (!window.confirm("Import " + valid.length + " cards? Existing cards will be kept; duplicate IDs will be skipped.")) return;
      const ids = new Set(cards.map(c => c.id)); let added = 0;
      valid.forEach(c => { if (!ids.has(c.id)) { cards.push(c); ids.add(c.id); added++; } });
      if (parsed.reviewStats && typeof parsed.reviewStats === "object") {
        reviewStats.reviewed += Math.max(0, Number(parsed.reviewStats.reviewed)||0);
        reviewStats.correct += Math.max(0, Number(parsed.reviewStats.correct)||0);
      }
      persist(); buildQueue(); renderLibrary(); $("form-notice").textContent = "Imported " + added + " new cards.";
    } catch (error) { $("form-notice").textContent = error.message || "Could not import this backup."; }
    finally { $("import-file").value = ""; }
  });
  $("signout").addEventListener("click", () => { localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); window.location.replace("login.html"); });
  syncFromAccount().then(() => { buildQueue(); renderLibrary(); }).catch(error => {
    console.error("Could not load Memory Mastery from account", error);
    buildQueue(); renderLibrary();
    $("form-notice").textContent = "Your saved cards could not sync with your account. " + error.message;
  });
})();