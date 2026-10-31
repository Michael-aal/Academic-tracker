(() => {
  "use strict";
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const TOKEN_KEY = "academic-tracker-token";
  const ACCOUNT_KEY = (() => { try { return JSON.parse(localStorage.getItem("academic-tracker-user") || "{}").id || "account"; } catch { return "account"; } })();
  const ATTEMPT_KEY = "academic-tracker-active-quiz:" + ACCOUNT_KEY;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  let attemptId = params.get("attempt");
  let quiz = null;
  let index = 0;
  let selected = {};
  let submittedAnswers = {};
  let feedback = {};
  let result = null;
  let busy = false;
  let timerInterval = null;
  let timerDeadlines = {};
  let expiredQuestions = {};
  const selectionKey = () => "academic-tracker-quiz-selections-" + attemptId;
  const timerStateKey = () => "academic-tracker-quiz-timer-" + attemptId;
  function saveTimerState() { try { localStorage.setItem(timerStateKey(), JSON.stringify({ deadlines: timerDeadlines, expired: expiredQuestions })); } catch {} }
  function stopQuestionTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
  function playAnswerSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const now = context.currentTime;
      [660, 880].forEach((frequency, i) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + i * 0.085);
        gain.gain.setValueAtTime(0.0001, now + i * 0.085);
        gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.085 + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.085 + 0.14);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(now + i * 0.085); oscillator.stop(now + i * 0.085 + 0.15);
      });
      window.setTimeout(() => context.close().catch(() => {}), 450);
    } catch {}
  }
  function updateTimerDisplay(seconds, state = "running") {
    const chip = $("quiz-timer");
    if (!chip) return;
    chip.hidden = !quiz?.timePerQuestionSeconds;
    chip.dataset.state = state;
    $("quiz-timer-text").textContent = state === "expired" ? "Time’s up" : state === "answered" ? "Answered" : seconds + "s";
    chip.classList.toggle("is-urgent", state === "running" && seconds <= 5);
  }
  async function expireCurrentQuestion(question) {
    stopQuestionTimer();
    if (expiredQuestions[question.id] || submittedAnswers[question.id]) return;
    const chosen = selected[question.id];
    if (chosen) {
      busy = true;
      try {
        await api("/api/ai/attempts/" + encodeURIComponent(attemptId) + "/answer", { method: "POST", body: JSON.stringify({ questionId: question.id, optionId: chosen }) });
        submittedAnswers[question.id] = chosen;
        delete selected[question.id];
        try { localStorage.setItem(selectionKey(), JSON.stringify(selected)); } catch {}
      } catch (error) {
        notice(error.message || "Your answer could not be saved when time expired.", true);
        busy = false;
        return;
      }
      busy = false;
    }
    expiredQuestions[question.id] = true;
    saveTimerState();
    updateTimerDisplay(0, "expired");
    notice(chosen ? "Time is up. Your selected answer has been saved." : "Time is up. This question was left unanswered.");
    renderQuestion();
    const expiredIndex = quiz.questions.findIndex(item => item.id === question.id);
    if (expiredIndex >= 0 && expiredIndex < quiz.questions.length - 1) window.setTimeout(() => { if (index === expiredIndex && expiredQuestions[question.id] && !result) { index++; renderQuestion(); } }, 1100);
  }
  function startQuestionTimer() {
    stopQuestionTimer();
    const seconds = Number(quiz?.timePerQuestionSeconds || 0);
    const question = quiz?.questions[index];
    if (!seconds || !question) { if ($("quiz-timer")) $("quiz-timer").hidden = true; return; }
    if (submittedAnswers[question.id]) { updateTimerDisplay(0, "answered"); return; }
    if (expiredQuestions[question.id]) { updateTimerDisplay(0, "expired"); $("quiz-answer-options").querySelectorAll("button").forEach(button => button.disabled = true); return; }
    if (!timerDeadlines[question.id]) { timerDeadlines[question.id] = Date.now() + seconds * 1000; saveTimerState(); }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerDeadlines[question.id] - Date.now()) / 1000));
      updateTimerDisplay(remaining, "running");
      if (remaining <= 0) expireCurrentQuestion(question);
    };
    tick();
    if (!expiredQuestions[question.id] && !submittedAnswers[question.id]) timerInterval = window.setInterval(tick, 200);
  }

  if (!localStorage.getItem(TOKEN_KEY)) { window.location.replace("login.html"); return; }
  if (!attemptId) attemptId = localStorage.getItem(ATTEMPT_KEY);
  if (attemptId) localStorage.setItem(ATTEMPT_KEY, attemptId);

  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch(API_BASE + path, {
      ...options,
      headers: { Authorization: "Bearer " + token, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("academic-tracker-user");
      window.location.replace("login.html");
      throw new Error("Your session expired. Please sign in again.");
    }
    if (!response.ok) throw new Error(data.error || "Could not complete this request.");
    return data;
  }
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function markdown(parent, value) {
    const text = String(value || "");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (i) parent.append(document.createElement("br"));
      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\x60[^\x60]+\x60)/g);
      parts.forEach(part => {
        if (part.startsWith("**") && part.endsWith("**")) parent.append(el("strong", "", part.slice(2, -2)));
        else if (part.startsWith("*") && part.endsWith("*")) { const em = el("em", "", part.slice(1, -1)); parent.append(em); }
        else if (part.startsWith("`") && part.endsWith("`")) parent.append(el("code", "", part.slice(1, -1)));
        else parent.append(document.createTextNode(part));
      });
    });
  }
  function notice(message, isError = false) {
    $("quiz-notice").textContent = message;
    $("quiz-notice").classList.toggle("is-error", isError);
  }
  function showError(message) {
    $("quiz-loading").hidden = true;
    $("quiz-workspace").hidden = true;
    $("quiz-error").hidden = false;
    $("quiz-error-message").textContent = message;
  }
  function renderQuestion() {
    if (!quiz || result) return;
    stopQuestionTimer();
    const question = quiz.questions[index];
    const answered = Object.prototype.hasOwnProperty.call(submittedAnswers, question.id);
    const choice = answered ? submittedAnswers[question.id] : selected[question.id];
    $("quiz-title").textContent = quiz.title || "Revision quiz";
    $("quiz-progress-text").textContent = "Question " + (index + 1) + " of " + quiz.questions.length;
    $("quiz-navigation-count").textContent = (index + 1) + " / " + quiz.questions.length;
    $("question-number").textContent = "QUESTION " + (index + 1);
    $("question-status").textContent = answered ? "Answer saved" : choice ? "Answer selected" : "Not answered";
    $("question-status").classList.toggle("is-answered", Boolean(choice));
    $("question-text").replaceChildren();
    markdown($("question-text"), question.question);
    const count = Object.keys(submittedAnswers).length + Object.keys(selected).filter(id => !Object.prototype.hasOwnProperty.call(submittedAnswers, id)).length;
    $("quiz-answered-count").textContent = count + " answered";
    const progress = Math.round(count / quiz.questions.length * 100);
    $("quiz-progress-fill").style.width = progress + "%";
    $("quiz-progress-track").setAttribute("aria-valuenow", String(progress));
    const host = $("quiz-answer-options");
    host.replaceChildren();
    question.options.forEach(option => {
      const isSelected = choice === option.id;
      const button = el("button", "quiz-answer-option");
      button.type = "button";
      button.setAttribute("aria-pressed", String(isSelected));
      button.disabled = answered || busy;
      const letter = el("span", "quiz-answer-letter", option.id);
      const label = el("span", "quiz-answer-text");
      markdown(label, option.text);
      button.append(letter, label);
      if (isSelected) button.append(el("span", "quiz-option-check", "✓"));
      button.addEventListener("click", () => {
        if (answered || busy) return;
        selected[question.id] = option.id;
        playAnswerSound();
        try { localStorage.setItem(selectionKey(), JSON.stringify(selected)); } catch {}
        renderQuestion();
      });
      host.append(button);
    });
    $("quiz-previous").disabled = index === 0 || busy;
    $("quiz-next").disabled = index === quiz.questions.length - 1 || busy;
    $("quiz-next").textContent = index === quiz.questions.length - 1 ? "Last question" : "Next question →";
    $("quiz-hint-wrap").hidden = !question.hint;
    $("quiz-hint-text").hidden = true;
    $("quiz-hint-text").textContent = question.hint || "";
    $("quiz-hint-button").textContent = "Show hint";
    $("quiz-results").hidden = true;
    startQuestionTimer();
  }
  function renderResults(data) {
    stopQuestionTimer();
    result = data;
    $("quiz-results").replaceChildren();
    $("quiz-results").hidden = false;
    stopQuestionTimer();
    try { localStorage.removeItem(selectionKey()); localStorage.removeItem(timerStateKey()); } catch {}
    const title = el("h2", "", "Your results");
    const intro = el("p", "", "You scored " + data.score + " out of " + data.totalQuestions + " (" + data.percentage + "%). Review the explanations below.");
    const stats = el("div", "quiz-result-summary");
    [["Score", data.score + " / " + data.totalQuestions], ["Percentage", data.percentage + "%"], ["Correct", data.correctAnswers], ["Incorrect", data.incorrectAnswers], ["Unanswered", data.unanswered]].forEach(([label, value]) => {
      const item = el("div", "quiz-result-stat");
      item.append(el("span", "", label), el("strong", "", String(value)));
      stats.append(item);
    });
    const review = el("div", "quiz-result-review");
    data.review.forEach((item, i) => {
      const card = el("article", "quiz-review-card " + (item.isCorrect ? "review-correct" : item.selectedAnswer ? "review-incorrect" : ""));
      card.append(el("p", "", "QUESTION " + (i + 1)));
      const q = el("h3", "");
      markdown(q, item.question);
      card.append(q);
      const yours = el("p", "");
      yours.append(document.createTextNode("Your answer: "));
      markdown(yours, item.selectedText || "Not answered");
      const correct = el("p", "");
      correct.append(document.createTextNode("Correct answer (" + item.correctAnswer + "): "));
      markdown(correct, item.correctText);
      const explanation = el("p", "");
      markdown(explanation, item.explanation);
      card.append(yours, correct, explanation);
      review.append(card);
    });
    const actions = el("div", "quiz-result-actions");
    const retry = el("button", "quiz-primary-link", "Create another quiz");
    retry.type = "button";
    retry.addEventListener("click", () => {
      localStorage.removeItem(ATTEMPT_KEY);
      window.location.href = "ai-learning.html";
    });
    const dashboard = el("a", "quiz-secondary-link", "Return to dashboard");
    dashboard.href = "dashboard.html";
    actions.append(retry, dashboard);
    $("quiz-results").append(title, intro, stats, el("h3", "", "Review your answers"), review, actions);
    $("quiz-results").scrollIntoView({behavior:"smooth",block:"start"});
    $("quiz-workspace").querySelector(".quiz-overview-row").hidden = true;
    $("quiz-workspace").querySelector(".quiz-question-card").hidden = true;
    $("quiz-workspace").querySelector(".quiz-page-navigation").hidden = true;
    $("quiz-workspace").querySelector(".quiz-finish-panel").hidden = true;
    notice("Quiz completed. Your result has been saved to your account.");\n    api("/api/gamification/quiz/" + encodeURIComponent(attemptId) + "/claim", { method: "POST", body: JSON.stringify({}) })\n      .then(reward => {\n        const xp = el("p", "quiz-xp-reward", reward.duplicate ? "XP for this quiz has already been recorded." : "+" + reward.xpAwarded + " XP earned. Your learning level has been updated.");\n        $("quiz-results").append(xp);\n      })\n      .catch(error => console.warn("Quiz result saved; XP update could not sync yet:", error.message));
  }
  async function load() {
    if (!attemptId) { showError("No active quiz was found. Create a quiz first, then it will open here."); return; }
    try {
      const data = await api("/api/ai/attempts/" + encodeURIComponent(attemptId));
      quiz = data.quiz;
      if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) throw new Error("The saved quiz has no valid questions.");
      (data.submittedAnswers || []).forEach(a => { submittedAnswers[a.questionId] = a.optionId; });
      try {
        const timerState = JSON.parse(localStorage.getItem(timerStateKey()) || "{}");
        if (timerState && typeof timerState === "object") {
          timerDeadlines = timerState.deadlines && typeof timerState.deadlines === "object" ? timerState.deadlines : {};
          expiredQuestions = timerState.expired && typeof timerState.expired === "object" ? timerState.expired : {};
        }
      } catch {}
      try {
        const savedSelections = JSON.parse(localStorage.getItem(selectionKey()) || "{}");
        if (savedSelections && typeof savedSelections === "object" && !Array.isArray(savedSelections)) {
          quiz.questions.forEach(question => {
            const optionId = savedSelections[question.id];
            if (!submittedAnswers[question.id] && question.options.some(option => option.id === optionId)) selected[question.id] = optionId;
          });
        }
      } catch {}
      feedback = data.feedbackByQuestion || {};
      $("quiz-loading").hidden = true;
      $("quiz-workspace").hidden = false;
      if (data.status === "COMPLETED" && data.result) { renderResults(data.result); return; }
      renderQuestion();
    } catch (error) { showError(error.message || "The quiz could not be loaded. Please try again."); }
  }
  async function finishQuiz() {
    if (busy || result) return;
    stopQuestionTimer();
    const unanswered = quiz.questions.filter(q => !submittedAnswers[q.id] && !selected[q.id]).length;
    if (unanswered && !window.confirm("You have " + unanswered + " unanswered question(s). Submit anyway? They will receive no marks.")) return;
    busy = true;
    $("quiz-finish").disabled = true;
    $("quiz-finish").textContent = "Submitting…";
    notice("Saving your answers and calculating your score…");
    try {
      for (const question of quiz.questions) {
        const optionId = selected[question.id];
        if (!optionId || submittedAnswers[question.id]) continue;
        await api("/api/ai/attempts/" + encodeURIComponent(attemptId) + "/answer", {
          method: "POST", body: JSON.stringify({questionId: question.id, optionId})
        });
        submittedAnswers[question.id] = optionId;
        delete selected[question.id];
        try { localStorage.setItem(selectionKey(), JSON.stringify(selected)); } catch {}
      }
      const data = await api("/api/ai/attempts/" + encodeURIComponent(attemptId) + "/submit", {method:"POST",body:JSON.stringify({})});
      if (!data.result) throw new Error("The server did not return quiz results. Reload this page to check your saved attempt.");
      busy = false;
      renderResults(data.result);
    } catch (error) {
      busy = false;
      $("quiz-finish").disabled = false;
      $("quiz-finish").innerHTML = 'Submit quiz <span aria-hidden="true">→</span>';
      notice(error.message || "Your quiz could not be submitted. Please try again.", true);
      renderQuestion();
    }
  }
  $("quiz-previous").addEventListener("click", () => { if (index > 0 && !busy) { index--; renderQuestion(); } });
  $("quiz-next").addEventListener("click", () => { if (index < quiz.questions.length - 1 && !busy) { index++; renderQuestion(); } });
  $("quiz-finish").addEventListener("click", finishQuiz);
  $("quiz-hint-button").addEventListener("click", () => {
    const text = $("quiz-hint-text");
    text.hidden = !text.hidden;
    $("quiz-hint-button").textContent = text.hidden ? "Show hint" : "Hide hint";
  });
  $("quiz-signout").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("academic-tracker-user");
    window.location.replace("login.html");
  });
  load();
})();
