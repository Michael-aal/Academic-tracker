(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  const $ = id => document.getElementById(id);
  const state = { questions: [], notes: [], room: null, challengeId: null, refreshTimer: null, timerTimer: null, chatTimer: null, autoSkipKey: "", refreshPromise: null };
  const inviteFromUrl = new URLSearchParams(window.location.search).get("invite") || "";
  const pendingInvite = (inviteFromUrl || sessionStorage.getItem("academic-tracker-pending-challenge-invite") || "").trim().toUpperCase();
  if (pendingInvite && /^[A-F0-9]{10}$/.test(pendingInvite)) sessionStorage.setItem("academic-tracker-pending-challenge-invite", pendingInvite);
  if (!token) { window.location.replace(pendingInvite ? "register.html?challengeInvite=1" : "login.html"); return; }

  const user = (() => { try { return JSON.parse(localStorage.getItem("academic-tracker-user") || "{}"); } catch { return {}; } })();
  const currentUserId = user.id || user.userId || (() => { try { return JSON.parse(atob(token.split(".")[1])).sub || ""; } catch { return ""; } })();
  const educationTrack = String(user.educationTrack || "").toUpperCase();
  $("challenge-academic-return").href = ["HIGHER", "UNIVERSITY"].includes(educationTrack) ? "university-dashboard.html" : "dashboard.html";

  async function api(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const headers = {
      Authorization: "Bearer " + token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };
    // GET requests are safe to retry. Challenge creation is also safe because its
    // stable idempotency key makes a replay return the original challenge.
    const retryable = method === "GET" || Boolean(headers["Idempotency-Key"]);
    const maxAttempts = retryable ? 3 : 1;
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(API + path, {
          ...options,
          headers,
          cache: "no-store",
          signal: controller.signal
        });
        clearTimeout(timeout);
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          localStorage.removeItem("academic-tracker-token");
          localStorage.removeItem("academic-tracker-user");
          window.location.replace("login.html");
          throw new Error("Your session expired. Please sign in again.");
        }
        if (!response.ok) {
          const error = new Error(data.error || "The challenge request could not be completed.");
          error.status = response.status;
          if (Array.isArray(data.providerFailures) && data.providerFailures.length) {
            const detail = data.providerFailures.map(item =>
              [item.provider, item.status || "no status", item.category].filter(Boolean).join(" ")
            ).join("; ");
            error.message = (data.error || "AI provider request failed.") + " (" + detail + ")";
          }
          if (response.status === 404 && data.error === "Route not found.") {
            error.message = "Challenge API endpoint not found: " + method + " " + path + ". The backend deployment may be behind the website version.";
          }
          if (![502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) throw error;
          lastError = error;
        } else return data;
      } catch (error) {
        clearTimeout(timeout);
        if (error?.status || attempt === maxAttempts - 1) {
          if (error?.status) throw error;
          lastError = error;
        } else lastError = error?.name === "AbortError"
          ? new Error("The challenge server took too long to respond. Retrying…")
          : new Error("The connection was interrupted. Retrying…");
      }
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
    throw lastError || new Error("The challenge request could not be completed.");
  }
  const node = (tag, cls, value) => { const item = document.createElement(tag); if (cls) item.className = cls; if (value !== undefined) item.textContent = String(value); return item; };
  const status = (id, message, error = false) => { const target = $(id); if (target) { target.textContent = message; target.classList.toggle("is-error", error); } };
  const show = (id, visible) => { if ($(id)) $(id).hidden = !visible; };
  function stopTimers() {
    clearInterval(state.refreshTimer); clearInterval(state.timerTimer); clearInterval(state.chatTimer);
    state.refreshTimer = state.timerTimer = state.chatTimer = null;
  }

  function addQuestionCard(initial = {}) {
    const host = $("manual-question-list");
    if (host.children.length >= 50) { status("challenge-create-status", "A challenge can contain at most 50 questions.", true); return; }
    const card = node("fieldset", "manual-question-card");
    const heading = node("div", "manual-question-heading");
    heading.append(node("strong", "", "Question " + (host.children.length + 1)));
    const remove = node("button", "question-remove", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => { card.remove(); renumberQuestionCards(); });
    heading.append(remove);
    const promptLabel = node("label", "", "Question");
    const prompt = document.createElement("textarea"); prompt.rows = 2; prompt.maxLength = 1200; prompt.required = true; prompt.className = "manual-question-prompt"; prompt.placeholder = "Write the question…"; prompt.value = initial.prompt || "";
    promptLabel.append(prompt);
    card.append(heading, promptLabel);
    const options = node("div", "manual-question-options");
    ["A", "B", "C", "D"].forEach((letter, index) => {
      const label = node("label", "", "Option " + letter);
      const input = document.createElement("input"); input.className = "manual-question-option"; input.maxLength = 400; input.required = true; input.value = initial.options?.[index]?.text || ""; input.placeholder = "Option " + letter;
      label.append(input); options.append(label);
    });
    card.append(options);
    const correctLabel = node("label", "", "Correct answer");
    const correct = document.createElement("select"); correct.className = "manual-question-correct";
    ["A", "B", "C", "D"].forEach((letter, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = "Option " + letter; correct.append(option); });
    if (initial.correctIndex !== undefined) correct.value = String(initial.correctIndex);
    correctLabel.append(correct);
    const explanationLabel = node("label", "", "Explanation (optional)");
    const explanation = document.createElement("input"); explanation.className = "manual-question-explanation"; explanation.maxLength = 1000; explanation.value = initial.explanation || ""; explanation.placeholder = "Explain why the answer is correct";
    explanationLabel.append(explanation);
    card.append(correctLabel, explanationLabel);
    host.append(card);
    $("manual-question-count").textContent = host.children.length + " / 50";
  }
  function renumberQuestionCards() {
    [...$("manual-question-list").children].forEach((card, index) => { const label = card.querySelector(".manual-question-heading strong"); if (label) label.textContent = "Question " + (index + 1); });
    $("manual-question-count").textContent = $("manual-question-list").children.length + " / 50";
  }
  function collectManualQuestions() {
    const cards = [...$("manual-question-list").children];
    if (!cards.length) throw new Error("Add at least one question.");
    return cards.map((card, index) => {
      const prompt = card.querySelector(".manual-question-prompt").value.trim();
      const values = [...card.querySelectorAll(".manual-question-option")].map(input => input.value.trim());
      const correctIndex = Number(card.querySelector(".manual-question-correct").value);
      if (!prompt || values.some(value => !value)) throw new Error("Complete the question and all four options for Question " + (index + 1) + ".");
      const options = values.map((text, optionIndex) => ({ id: "q" + (index + 1) + "-o" + (optionIndex + 1), text }));
      return { id: "question-" + (index + 1), prompt, options, correctOptionId: options[correctIndex].id, explanation: card.querySelector(".manual-question-explanation").value.trim() };
    });
  }
  function mapAiQuestions(quiz, offset) {
    if (!quiz || !Array.isArray(quiz.questions)) throw new Error("AI did not return a valid question set.");
    return quiz.questions.map((question, index) => {
      const options = (question.options || []).map((option, optionIndex) => ({ id: String(option.id || "opt-" + optionIndex), text: String(option.text || "") }));
      const correctOptionId = String(question.correctAnswer || question.correctOptionId || "");
      if (!question.question || options.length !== 4 || !options.some(option => option.id === correctOptionId)) throw new Error("AI returned an incomplete question. Please generate the set again.");
      return { id: "ai-question-" + (offset + index + 1), prompt: String(question.question), options, correctOptionId, explanation: String(question.explanation || "") };
    });
  }
  async function generateAiQuestions(sourceText, count, difficulty, statusId) {
    const total = Math.max(1, Math.min(50, Number(count) || 10));
    const material = String(sourceText || "").trim();
    if (material.length < 3) throw new Error("Enter a topic or select saved notes first.");
    const questions = [];
    for (let offset = 0; offset < total; offset += 10) {
      const batch = Math.min(10, total - offset);
      status(statusId, "Generating questions " + (offset + 1) + "–" + (offset + batch) + " of " + total + "…");
      const result = await api("/api/ai", { method: "POST", body: JSON.stringify({
        action: "quiz", subject: "Revision challenge", topic: "Create a fair shared challenge question set.",
        content: material.slice(0, 12000), questionCount: batch, difficulty,
        level: user.educationTrack === "HIGHER" ? "higher institution / university" : "secondary school"
      }) });
      questions.push(...mapAiQuestions(result.quiz, offset));
    }
    return questions;
  }
  async function loadNotes() {
    try {
      const data = await api("/api/user-data/study-notes");
      state.notes = (data.records || []).map(record => ({ id: record.recordId, title: record.data?.title || record.data?.subject || record.recordId, content: record.data?.content || record.data?.text || record.data?.body || "" })).filter(note => note.content);
      const select = $("challenge-note-select"); select.replaceChildren();
      state.notes.forEach(note => { const option = document.createElement("option"); option.value = note.id; option.textContent = note.title; select.append(option); });
      if (!state.notes.length) { const option = document.createElement("option"); option.value = ""; option.textContent = "No saved notes found"; select.append(option); }
    } catch (error) {
      $("challenge-note-select").replaceChildren(node("option", "", "Could not load saved notes"));
      status("challenge-create-status", "Saved notes could not be loaded: " + error.message, true);
    }
  }
  function selectedNote() { return state.notes.find(note => note.id === $("challenge-note-select").value); }

  $("add-manual-question").addEventListener("click", () => addQuestionCard());
  $("challenge-mode").addEventListener("change", () => {
    const mode = $("challenge-mode").value;
    show("team-create-fields", mode === "TEAM");
    $("challenge-mode-help").textContent = mode === "DUEL"
      ? "Two students compete with the same question set. The host can also join as a competitor."
      : mode === "TEAM"
        ? "Two teams of up to five students share answers. The first joined teammate submits each team answer."
        : "A separate Mastermind hosts the tournament. Two to six students compete individually.";
  });
  $("question-source").addEventListener("change", () => {
    state.questions = [];
    const source = $("question-source").value;
    show("manual-question-source", source === "manual");
    show("notebook-question-source", source === "notebook");
    show("ai-question-source", source === "ai");
    if (source === "notebook") loadNotes();
  });
  ["challenge-topic", "ai-question-count", "ai-question-difficulty", "challenge-note-select", "notebook-question-count"].forEach(id => {
    const field = $(id);
    field?.addEventListener("input", () => { state.questions = []; });
    field?.addEventListener("change", () => { state.questions = []; });
  });
  $("generate-ai-questions").addEventListener("click", async () => {
    const button = $("generate-ai-questions"); button.disabled = true;
    try {
      state.questions = await generateAiQuestions($("challenge-topic").value, $("ai-question-count").value, $("ai-question-difficulty").value, "challenge-create-status");
      status("challenge-create-status", state.questions.length + " questions generated. Create the challenge to save this exact set.");
    } catch (error) { status("challenge-create-status", error.message, true); }
    finally { button.disabled = false; }
  });
  $("generate-from-notes").addEventListener("click", async () => {
    const note = selectedNote();
    if (!note) { status("challenge-create-status", "Choose a saved note with study content first.", true); return; }
    const button = $("generate-from-notes"); button.disabled = true;
    try {
      state.questions = await generateAiQuestions(note.content, $("notebook-question-count").value, $("ai-question-difficulty").value, "challenge-create-status");
      status("challenge-create-status", state.questions.length + " questions generated from “" + note.title + "”.");
    } catch (error) { status("challenge-create-status", error.message, true); }
    finally { button.disabled = false; }
  });

  function challengeCreationKey() {
    let key = sessionStorage.getItem("academic-tracker-challenge-create-key");
    if (!key) {
      key = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : "challenge-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      sessionStorage.setItem("academic-tracker-challenge-create-key", key);
    }
    return key;
  }

  $("challenge-create-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("create-challenge"); button.disabled = true;
    try {
      const mode = $("challenge-mode").value;
      const source = $("question-source").value;
      let questions;
      if (source === "manual") questions = collectManualQuestions();
      else if (state.questions.length) questions = state.questions;
      else if (source === "notebook") {
        const note = selectedNote(); if (!note) throw new Error("Choose saved notes first.");
        questions = await generateAiQuestions(note.content, $("notebook-question-count").value, $("ai-question-difficulty").value, "challenge-create-status");
      } else questions = await generateAiQuestions($("challenge-topic").value, $("ai-question-count").value, $("ai-question-difficulty").value, "challenge-create-status");
      const result = await api("/api/challenges", {
        method: "POST",
        headers: { "Idempotency-Key": challengeCreationKey() },
        body: JSON.stringify({
          title: $("challenge-title").value.trim(), mode, questions,
          timerSeconds: Number($("challenge-timer").value), source
        })
      });
      const challenge = result.challenge;
      sessionStorage.removeItem("academic-tracker-challenge-create-key");
      let hostJoinWarning = "";
      if (mode !== "FREE_FOR_ALL") {
        try {
          await api("/api/challenges/" + encodeURIComponent(challenge.id) + "/join", {
            method: "POST", body: JSON.stringify({ teamKey: mode === "TEAM" ? $("challenge-team").value : null })
          });
        } catch (joinError) {
          // The challenge itself is already safely saved. Keep the room accessible
          // and explain the separate host-join issue instead of reporting total failure.
          hostJoinWarning = " The challenge was created, but host entry needs attention: " + joinError.message;
        }
      }
      status("challenge-create-status", "Challenge created. Invitation code: " + challenge.inviteCode + hostJoinWarning, Boolean(hostJoinWarning));
      await loadMyChallenges();
      await openRoom(challenge.id);
    } catch (error) { status("challenge-create-status", error.message, true); }
    finally { button.disabled = false; }
  });

  $("challenge-join-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const result = await api("/api/challenges/join", { method: "POST", body: JSON.stringify({
        inviteCode: $("challenge-invite-code").value.trim().toUpperCase(),
        teamKey: $("join-team").value
      }) });
      await loadMyChallenges(); await openRoom(result.challengeId);
    } catch (error) { status("challenge-join-status", error.message, true); }
    finally { button.disabled = false; }
  });

  async function loadMyChallenges() {
    const host = $("my-challenges-list");
    try {
      const data = await api("/api/challenges/mine");
      host.replaceChildren();
      if (!data.challenges?.length) { host.append(node("p", "challenge-muted", "No challenges yet. Create one or join with an invitation code.")); return; }
      data.challenges.forEach(challenge => {
        const card = node("article", "my-challenge-card");
        const title = node("strong", "", challenge.title);
        const meta = node("small", "", challenge.mode.replaceAll("_", " ") + " · " + challenge.status + " · " + challenge.participantCount + " students");
        const open = node("button", "challenge-secondary", challenge.status === "CLOSED" || challenge.status === "FINISHED" ? "View results" : "Open room"); open.type = "button"; open.addEventListener("click", () => openRoom(challenge.id));
        card.append(title, meta, open);
        if (challenge.isHost && ["LOBBY", "ACTIVE"].includes(challenge.status)) {
          const close = node("button", "challenge-secondary", "Close challenge"); close.type = "button";
          close.addEventListener("click", () => closeChallenge(challenge.id));
          card.append(close);
        }
        host.append(card);
      });
    } catch (error) {
      if (!host.children.length) host.append(node("p", "challenge-muted", error.message));
      else status("challenge-create-status", "Could not refresh your challenge list. Your current list is still shown. " + error.message, true);
    }
  }
  $("refresh-challenges").addEventListener("click", loadMyChallenges);

  function showRoom(open) {
    show("challenge-room", open);
    document.querySelector(".challenge-entry-grid").hidden = open;
    $("challenge-intro").hidden = open;
    if (open) $("challenge-room").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderParticipants(room) {
    const host = $("room-participants"); host.replaceChildren();
    $("room-participant-count").textContent = room.participants.length + " joined";
    room.participants.forEach(person => {
      const item = node("div", "room-participant");
      item.append(node("strong", "", person.name), node("small", "", person.teamKey ? "Team " + person.teamKey : "Competitor"));
      host.append(item);
    });
  }
  function renderRankings(room) {
    const host = $("room-rankings"); host.replaceChildren();
    (room.rankings || []).forEach(row => {
      const item = node("li", "room-ranking");
      item.append(node("span", "room-rank-number", "#" + row.rank), node("strong", "room-rank-name", row.label), node("span", "room-rank-score", row.score + " / " + row.totalQuestions));
      if (row.members?.length > 1) item.append(node("small", "room-rank-members", row.members.join(", ")));
      host.append(item);
    });
    if (!room.rankings?.length) host.append(node("p", "challenge-muted", "Rankings appear when competitors join."));
  }
  function isTeamCaptain(room) {
    if (room.challenge.mode !== "TEAM") return true;
    const mine = room.participants.find(person => person.userId === currentUserId);
    if (!mine?.teamKey) return false;
    const teammates = room.participants.filter(person => person.teamKey === mine.teamKey);
    return teammates[0]?.userId === currentUserId;
  }
  async function submitAnswer(questionIndex, optionId) {
    const buttons = $("room-options").querySelectorAll("button"); buttons.forEach(button => button.disabled = true);
    try {
      await api("/api/challenges/" + encodeURIComponent(state.challengeId) + "/answer", {
        method: "POST", body: JSON.stringify({ questionIndex, optionId })
      });
      status("room-answer-feedback", "Answer saved. Rankings are updating.");
      await refreshRoom();
    } catch (error) { status("room-answer-feedback", error.message, true); buttons.forEach(button => button.disabled = false); }
  }
  function renderReview(room) {
    const host = $("room-review-list"); host.replaceChildren();
    room.challenge.questions.forEach((question, index) => {
      const card = node("article", "room-review-card");
      card.append(node("strong", "", "Question " + (index + 1)), node("p", "", question.prompt));
      const correct = question.options.find(option => option.id === question.correctOptionId);
      card.append(node("p", "room-review-answer", "Correct answer: " + (correct?.text || "Unavailable")));
      if (question.explanation) card.append(node("p", "challenge-muted", question.explanation));
      host.append(card);
    });
  }
  function renderQuestion(room) {
    const section = $("room-question-section");
    show("room-review", room.challenge.status === "FINISHED" || room.challenge.status === "CLOSED");
    if (room.challenge.status === "FINISHED" || room.challenge.status === "CLOSED") {
      section.hidden = true;
      renderReview(room);
      return;
    }
    if (room.challenge.status !== "ACTIVE") { section.hidden = true; return; }
    section.hidden = false;
    if (room.challenge.mode === "FREE_FOR_ALL" && room.challenge.isHost) {
      $("question-progress").textContent = "Mastermind · host view";
      $("question-timer").textContent = "";
      $("room-question").textContent = "You are hosting this tournament.";
      $("room-options").replaceChildren(node("p", "challenge-muted", "You do not compete in Free-for-all. Watch the live rankings while the students answer the same question set."));
      return;
    }
    const index = room.myAnswers.length;
    const questions = room.challenge.questions;
    if (index >= questions.length) {
      $("room-question").textContent = "You have completed the question set.";
      $("room-options").replaceChildren(node("p", "challenge-muted", "Your answers are saved. Wait for the other competitors to finish."));
      $("question-progress").textContent = questions.length + " / " + questions.length + " answered";
      $("question-timer").textContent = "";
      return;
    }
    if (!isTeamCaptain(room)) {
      $("room-question").textContent = "Your team is working on this challenge.";
      $("room-options").replaceChildren(node("p", "challenge-muted", "Your team captain submits the shared answer. Follow team progress in the rankings and discuss strategy in team chat."));
      $("question-progress").textContent = "Team mode";
      $("question-timer").textContent = "";
      return;
    }
    const question = questions[index];
    $("question-progress").textContent = "Question " + (index + 1) + " of " + questions.length;
    $("room-question").textContent = question.prompt;
    const host = $("room-options"); host.replaceChildren();
    question.options.forEach(option => {
      const button = node("button", "room-option", option.text); button.type = "button";
      button.addEventListener("click", () => submitAnswer(index, option.id));
      host.append(button);
    });
    const timer = room.challenge.timerSeconds;
    if (timer > 0 && room.challenge.startedAt) {
      const deadline = new Date(room.challenge.startedAt).getTime() + (index + 1) * timer * 1000;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $("question-timer").textContent = remaining + "s";
      if (remaining === 0 && state.autoSkipKey !== state.challengeId + ":" + index) {
        state.autoSkipKey = state.challengeId + ":" + index;
        submitAnswer(index, null);
      }
    } else $("question-timer").textContent = "No timer";
  }
  async function loadTeamMessages() {
    const room = state.room;
    if (!room || room.challenge.mode !== "TEAM" || !room.participants.some(item => item.userId === currentUserId)) return;
    try {
      const data = await api("/api/challenges/" + encodeURIComponent(state.challengeId) + "/messages");
      const host = $("team-chat-messages"); const atBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 60;
      host.replaceChildren();
      data.messages.forEach(message => host.append(node("article", "team-chat-message", message.name + ": " + message.body)));
      if (atBottom) host.scrollTop = host.scrollHeight;
    } catch {}
  }
  async function refreshRoom() {
    if (!state.challengeId) return;
    if (state.refreshPromise) return state.refreshPromise;
    const requestedChallengeId = state.challengeId;
    state.refreshPromise = (async () => {
    try {
      const data = await api("/api/challenges/" + encodeURIComponent(requestedChallengeId));
      if (state.challengeId !== requestedChallengeId) return;
      state.room = data;
      const room = data;
      $("room-title").textContent = room.challenge.title;
      $("room-subtitle").textContent = room.challenge.mode.replaceAll("_", " ") + " · " + room.challenge.status;
      if (room.challenge.isHost && room.challenge.inviteCode && room.challenge.status !== "CLOSED") {
        show("room-invite", true); $("room-invite-code").textContent = room.challenge.inviteCode;
        const shareUrl = new URL("challenge.html", window.location.href); shareUrl.searchParams.set("invite", room.challenge.inviteCode); $("copy-invite-link").dataset.inviteUrl = shareUrl.toString();
      } else show("room-invite", false);
      renderParticipants(room); renderRankings(room); renderQuestion(room);
      show("start-challenge", room.challenge.isHost && room.challenge.status === "LOBBY");
      show("finish-challenge", room.challenge.isHost && room.challenge.status === "ACTIVE");
      show("close-challenge", room.challenge.isHost && ["LOBBY", "ACTIVE"].includes(room.challenge.status));
      show("team-chat-panel", room.challenge.mode === "TEAM" && room.participants.some(item => item.userId === currentUserId));
      show("team-chat-form", room.challenge.status !== "CLOSED");
      if (room.challenge.status === "LOBBY") status("room-status", room.challenge.isHost ? "Share the invitation code. Start when the required competitors have joined." : "Waiting for the host to start the challenge.");
      else if (room.challenge.status === "FINISHED") status("room-status", "Challenge complete. Final answers and rankings are ready.");
      else if (room.challenge.status === "CLOSED") status("room-status", "This challenge was closed by its host. Its participants, scores and answer review are preserved in your challenge history. Create a new challenge whenever you are ready.");
      else status("room-status", "The same question set is active for every competitor.");
      await loadTeamMessages();
    } catch (error) {
      if (state.challengeId === requestedChallengeId) {
        status("room-status", "Connection interrupted. Your saved challenge data is safe. " + error.message, true);
      }
    }
    })();
    try { await state.refreshPromise; } finally { state.refreshPromise = null; }
  }
  async function openRoom(id) {
    stopTimers(); state.challengeId = id; state.autoSkipKey = ""; showRoom(true);
    await refreshRoom();
    state.refreshTimer = setInterval(refreshRoom, 5000);
    state.timerTimer = setInterval(() => { if (state.room) renderQuestion(state.room); }, 500);
  }
  $("start-challenge").addEventListener("click", async () => {
    const button = $("start-challenge"); button.disabled = true;
    try { await api("/api/challenges/" + encodeURIComponent(state.challengeId) + "/start", { method: "POST", body: JSON.stringify({}) }); await refreshRoom(); }
    catch (error) { status("room-status", error.message, true); }
    finally { button.disabled = false; }
  });
  async function closeChallenge(id) {
    if (!id) return;
    if (!window.confirm("Close this challenge? Nobody will be able to join or submit more answers. Existing participants, scores and results will be kept in challenge history. You can create a new challenge afterwards.")) return;
    try {
      await api("/api/challenges/" + encodeURIComponent(id) + "/close", { method: "POST", body: JSON.stringify({}) });
      await loadMyChallenges();
      if (state.challengeId === id) await refreshRoom();
      else status("challenge-create-status", "Challenge closed. Its history has been preserved. You can create a new challenge now.");
    } catch (error) {
      if (state.challengeId === id) status("room-status", error.message, true);
      else status("challenge-create-status", error.message, true);
    }
  }
  $("close-challenge").addEventListener("click", () => closeChallenge(state.challengeId));
  $("finish-challenge").addEventListener("click", async () => {
    if (!window.confirm("Finish this challenge and reveal the final results?")) return;
    try { await api("/api/challenges/" + encodeURIComponent(state.challengeId) + "/finish", { method: "POST", body: JSON.stringify({}) }); await refreshRoom(); }
    catch (error) { status("room-status", error.message, true); }
  });
  $("copy-invite-code").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("room-invite-code").textContent); status("room-status", "Invitation code copied."); }
    catch { status("room-status", "Select and copy the invitation code."); }
  });
  $("copy-invite-link").addEventListener("click", async () => {
    const url = $("copy-invite-link").dataset.inviteUrl;
    if (!url) return status("room-status", "No invitation link is available.", true);
    try { if (navigator.share) await navigator.share({ title: "Join my Preproom challenge", text: "Open this link to join my study challenge.", url }); else { await navigator.clipboard.writeText(url); status("room-status", "Shareable challenge link copied."); } }
    catch (error) { if (error.name !== "AbortError") status("room-status", "Could not share the invitation link.", true); }
  });
  $("leave-room").addEventListener("click", () => {
    stopTimers(); state.challengeId = null; state.room = null; showRoom(false); loadMyChallenges();
  });
  $("team-chat-form").addEventListener("submit", async event => {
    event.preventDefault(); const input = $("team-chat-input"), body = input.value.trim(); if (!body) return;
    try { await api("/api/challenges/" + encodeURIComponent(state.challengeId) + "/messages", { method: "POST", body: JSON.stringify({ body }) }); input.value = ""; await loadTeamMessages(); }
    catch (error) { status("room-status", error.message, true); }
  });

  $("challenge-intro").hidden = false;
  addQuestionCard();
  loadNotes();
  loadMyChallenges();
  if (pendingInvite && /^[A-F0-9]{10}$/.test(pendingInvite)) {
    (async () => {
      try {
        let teamKey = null;
        const choice = String(window.prompt("For a Team Challenge, enter A or B. Otherwise leave blank:", "") || "").trim().toUpperCase();
        if (choice === "A" || choice === "B") teamKey = choice;
        const result = await api("/api/challenges/join", { method: "POST", body: JSON.stringify({ inviteCode: pendingInvite, teamKey }) });
        sessionStorage.removeItem("academic-tracker-pending-challenge-invite");
        const cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete("invite"); window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
        await loadMyChallenges(); await openRoom(result.challengeId);
      } catch (error) { status("challenge-join-status", error.message, true); sessionStorage.removeItem("academic-tracker-pending-challenge-invite"); }
    })();
  }
})();