(() => {
  "use strict";
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  if (!token) { window.location.replace("login.html"); return; }

  const $ = id => document.getElementById(id);
  const ATTEMPT_KEY = "academic-tracker-active-quiz";
  const state = { action: "tutor", answer: "", quiz: null, attemptId: null, index: 0, selected: {}, answered: {}, submitted: false, result: null };
  const taskCopy = {
    tutor: { title: "Ask your tutor", description: "Tell me what you're learning and where you're stuck.", label: "What would you like help understanding?", placeholder: "e.g. Explain Newton's second law and show me a simple example…", button: "Help me understand", result: "Your explanation" },
    quiz: { title: "Build a revision quiz", description: "Create practice questions from a topic or your own notes.", label: "Paste your notes or describe the topic", placeholder: "Paste your notes here, or describe the topic you want to practise…", button: "Generate my quiz", result: "Your practice quiz" },
    summarize: { title: "Summarize my notes", description: "Make revision easier by finding the key ideas.", label: "Paste the notes you want to revise", placeholder: "Paste your lesson notes here…", button: "Summarize my notes", result: "Revision summary" },
    "study-plan": { title: "Plan my study week", description: "Break a topic into small, manageable study sessions.", label: "What do you need to study?", placeholder: "Tell me the subjects, topics, and any test date you want to prepare for…", button: "Create my study plan", result: "Your 7-day study plan" }
  };
  const user = (() => { try { return JSON.parse(localStorage.getItem("academic-tracker-user") || "{}"); } catch { return {}; } })();
  if (user.role === "ADMIN" || user.isAdmin) {
    const nav = document.querySelector(".ai-topbar nav");
    const link = document.createElement("a");
    link.href = "admin-ai.html"; link.textContent = "AI admin"; nav.insertBefore(link, nav.children[1] || null);
  }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      ...options,
      headers: { Authorization: "Bearer " + token, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("academic-tracker-token");
      localStorage.removeItem("academic-tracker-user");
      window.location.replace("login.html");
      throw new Error("Your session expired. Please sign in again.");
    }
    if (!response.ok) throw new Error(data.error || "Could not complete this request.");
    return data;
  }

  function setNotice(message, error = false) {
    $("notice").textContent = message;
    $("notice").classList.toggle("error", error);
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function setAction(action) {
    state.action = action;
    const copy = taskCopy[action];
    document.querySelectorAll("[data-action]").forEach(button => button.classList.toggle("active", button.dataset.action === action));
    $("task-title").textContent = copy.title;
    $("task-description").textContent = copy.description;
    $("content-label").textContent = copy.label;
    $("content").placeholder = copy.placeholder;
    $("submit-label").textContent = copy.button;
    $("result-title").textContent = copy.result;
    $("quiz-options").hidden = action !== "quiz";
    $("copy-result").hidden = action === "quiz";
    $("content").value = "";
    $("char-count").textContent = "0 / 12,000 characters";
    $("result-panel").hidden = true;
    setNotice("");
  }

  function renderQuiz(quiz, attemptId, submittedAnswers = [], result = null, feedbackByQuestion = {}) {
    state.quiz = quiz;
    state.attemptId = attemptId;
    state.index = 0;
    state.selected = {};
    state.answered = {};
    state.submitted = false;
    state.result = result;
    state.feedbackByQuestion = feedbackByQuestion || {};
    (submittedAnswers || []).forEach(answer => { state.answered[answer.questionId] = answer.optionId; });
    localStorage.setItem(ATTEMPT_KEY, attemptId);
    $("result-title").textContent = quiz.title || "Your practice quiz";
    $("copy-result").hidden = true;
    const host = $("result-content");
    host.replaceChildren();
    if (result) { renderResults(result); return; }

    const intro = el("p", "quiz-intro", "Choose one answer, then submit it to see feedback. Your answers are saved to your account.");
    host.append(intro);
    const progressWrap = el("div", "quiz-progress-wrap");
    const progress = el("div", "quiz-progress");
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    const progressTrack = el("div", "quiz-progress-track");
    const progressFill = el("div", "quiz-progress-fill");
    progressTrack.append(progressFill);
    progressWrap.append(progress, progressTrack);
    host.append(progressWrap);

    const card = el("article", "question-card");
    card.setAttribute("aria-live", "polite");
    const actions = el("div", "quiz-navigation");
    const previous = el("button", "quiz-nav-button", "← Previous");
    previous.type = "button";
    const next = el("button", "quiz-nav-button", "Next →");
    next.type = "button";
    const submitAnswer = el("button", "quiz-submit", "Submit answer");
    submitAnswer.type = "button";
    const finish = el("button", "quiz-finish", "Finish quiz");
    finish.type = "button";
    const feedback = el("div", "question-feedback");
    feedback.hidden = true;
    const answerStatus = el("p", "answer-status");
    const optionHost = el("div", "answer-options");
    const hintButton = el("button", "quiz-hint-button", "Show hint");
    hintButton.type = "button";
    const hintText = el("p", "quiz-hint");
    hintText.hidden = true;
    hintButton.addEventListener("click", () => {
      const question = state.quiz.questions[state.index];
      if (!question.hint) { hintText.textContent = "No hint was provided for this question."; }
      else hintText.textContent = question.hint;
      hintText.hidden = !hintText.hidden;
      hintButton.textContent = hintText.hidden ? "Show hint" : "Hide hint";
    });
    actions.append(previous, next);
    const footer = el("div", "quiz-submit-row");
    const navNote = el("p", "quiz-nav-note");
    footer.append(navNote, submitAnswer, finish);
    card.append(el("div", "question-meta"), el("h4", "question-title"), optionHost, hintButton, hintText, feedback, answerStatus);
    host.append(card, actions, footer);

    function refresh() {
      const question = state.quiz.questions[state.index];
      const alreadyAnswered = Object.prototype.hasOwnProperty.call(state.answered, question.id);
      progress.textContent = "Question " + (state.index + 1) + " of " + state.quiz.questions.length + " · " + Object.keys(state.answered).length + " answered";
      progressFill.style.width = (Object.keys(state.answered).length / state.quiz.questions.length * 100) + "%";
      card.querySelector(".question-meta").textContent = "QUESTION " + (state.index + 1) + " OF " + state.quiz.questions.length;
      card.querySelector(".question-title").textContent = question.question;
      optionHost.replaceChildren();
      question.options.forEach(option => {
        const button = el("button", "answer-option");
        button.type = "button";
        button.dataset.optionId = option.id;
        button.setAttribute("aria-pressed", String(state.selected[question.id] === option.id || state.answered[question.id] === option.id));
        const letter = el("span", "answer-letter", option.id);
        const text = el("span", "answer-text", option.text);
        button.append(letter, text);
        const selected = state.selected[question.id] === option.id;
        const answeredChoice = state.answered[question.id] === option.id;
        if (selected || answeredChoice) button.classList.add("selected");
        button.disabled = alreadyAnswered;
        button.addEventListener("click", () => {
          if (alreadyAnswered) return;
          state.selected[question.id] = option.id;
          optionHost.querySelectorAll(".answer-option").forEach(item => {
            const active = item.dataset.optionId === option.id;
            item.classList.toggle("selected", active);
            item.setAttribute("aria-pressed", String(active));
          });
          submitAnswer.disabled = false;
          answerStatus.textContent = "Selected " + option.id + ". Submit your answer to lock it in.";
        });
        optionHost.append(button);
      });
      previous.disabled = state.index === 0;
      next.disabled = state.index === state.quiz.questions.length - 1;
      submitAnswer.hidden = alreadyAnswered;
      submitAnswer.disabled = !state.selected[question.id];
      navNote.textContent = (state.quiz.questions.length - Object.keys(state.answered).length) + " question(s) remaining";
      answerStatus.textContent = alreadyAnswered ? "Answer submitted and locked." : "Select one option.";
      feedback.hidden = true;
      feedback.className = "question-feedback";
      if (alreadyAnswered && state.answered[question.id] && state.feedbackByQuestion?.[question.id]) {
        showFeedback(state.feedbackByQuestion[question.id]);
      }
      hintButton.hidden = !question.hint;
      hintText.hidden = true;
      hintButton.textContent = "Show hint";
    }
    function showFeedback(data) {
      feedback.hidden = false;
      feedback.className = "question-feedback " + (data.isCorrect ? "feedback-correct" : "feedback-incorrect");
      feedback.textContent = (data.isCorrect ? "Correct. " : "Not quite. Correct answer: " + data.correctAnswer + ". ") + data.explanation;
      optionHost.querySelectorAll(".answer-option").forEach(option => {
        option.disabled = true;
        if (option.dataset.optionId === data.correctAnswer) option.classList.add("answer-correct");
        else if (option.dataset.optionId === state.answered[state.quiz.questions[state.index].id]) option.classList.add("answer-incorrect");
      });
    }
    submitAnswer.addEventListener("click", async () => {
      const question = state.quiz.questions[state.index];
      const optionId = state.selected[question.id];
      if (!optionId || state.answered[question.id]) return;
      submitAnswer.disabled = true;
      submitAnswer.textContent = "Checking…";
      try {
        const data = await api("/api/ai/attempts/" + encodeURIComponent(state.attemptId) + "/answer", {
          method: "POST", body: JSON.stringify({ questionId: question.id, optionId })
        });
        state.answered[question.id] = optionId;
        state.feedbackByQuestion[question.id] = data;
        refresh();
        showFeedback(data);
        setNotice("Answer saved.");
      } catch (error) {
        setNotice(error.message || "Could not submit this answer.", true);
      } finally {
        submitAnswer.textContent = "Submit answer";
        submitAnswer.disabled = false;
        refresh();
      }
    });
    previous.addEventListener("click", () => { if (state.index > 0) { state.index--; refresh(); } });
    next.addEventListener("click", () => { if (state.index < state.quiz.questions.length - 1) { state.index++; refresh(); } });
    finish.addEventListener("click", async () => {
      const unanswered = state.quiz.questions.length - Object.keys(state.answered).length;
      if (unanswered && !window.confirm("You still have " + unanswered + " unanswered question(s). Finish the quiz anyway? Unanswered questions will receive no marks.")) return;
      finish.disabled = true;
      finish.textContent = "Finishing…";
      try {
        const data = await api("/api/ai/attempts/" + encodeURIComponent(state.attemptId) + "/submit", { method: "POST", body: JSON.stringify({}) });
        state.submitted = true;
        state.result = data.result;
        renderResults(data.result);
        setNotice("Quiz completed. Your results were saved to your account.");
      } catch (error) {
        setNotice(error.message || "Could not finish the quiz.", true);
      } finally {
        finish.disabled = false;
        finish.textContent = "Finish quiz";
      }
    });
    refresh();
  }

  function renderResults(result) {
    state.submitted = true;
    const host = $("result-content");
    host.replaceChildren();
    $("result-title").textContent = "Quiz results";
    const stats = el("div", "quiz-result-stats");
    [
      ["Total questions", result.totalQuestions],
      ["Correct", result.correctAnswers],
      ["Incorrect", result.incorrectAnswers],
      ["Unanswered", result.unanswered],
      ["Final score", result.score + " / " + result.totalQuestions],
      ["Percentage", result.percentage + "%"]
    ].forEach(([label, value]) => {
      const item = el("div", "quiz-result-stat");
      item.append(el("span", "", label), el("strong", "", String(value)));
      stats.append(item);
    });
    host.append(stats, el("h4", "review-heading", "Review your answers"));
    const reviewList = el("div", "quiz-review-list");
    result.review.forEach((item, index) => {
      const card = el("article", "quiz-review-card " + (item.isCorrect ? "review-correct" : item.selectedAnswer ? "review-incorrect" : "review-unanswered"));
      card.append(el("p", "question-meta", "QUESTION " + (index + 1)), el("h5", "question-title", item.question));
      card.append(el("p", "review-line", "Your answer: " + (item.selectedText || "Not answered")));
      card.append(el("p", "review-line", "Correct answer: " + item.correctAnswer + ". " + item.correctText));
      card.append(el("p", "review-explanation", item.explanation));
      reviewList.append(card);
    });
    host.append(reviewList);
    const actions = el("div", "quiz-result-actions");
    const retry = el("button", "quiz-submit", "Retry quiz");
    retry.type = "button";
    retry.addEventListener("click", () => {
      localStorage.removeItem(ATTEMPT_KEY);
      state.attemptId = null;
      state.quiz = null;
      $("result-panel").hidden = true;
      setAction("quiz");
      $("topic").focus();
      $("learning-form").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const dashboard = el("a", "quiz-dashboard-button", "Return to dashboard");
    dashboard.href = "dashboard.html";
    actions.append(retry, dashboard);
    host.append(actions);
    $("copy-result").hidden = true;
    $("result-panel").hidden = false;
    $("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => setAction(button.dataset.action)));
  $("content").addEventListener("input", () => { $("char-count").textContent = $("content").value.length.toLocaleString() + " / 12,000 characters"; });
  $("signout").addEventListener("click", () => {
    localStorage.removeItem("academic-tracker-token");
    localStorage.removeItem("academic-tracker-user");
    window.location.replace("login.html");
  });
  $("copy-result").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.answer);
      $("copy-result").textContent = "Copied";
      setTimeout(() => { $("copy-result").textContent = "Copy answer"; }, 1800);
    } catch { setNotice("Copy was blocked by your browser. Select the answer and copy it manually.", true); }
  });

  $("learning-form").addEventListener("submit", async event => {
    event.preventDefault();
    const content = $("content").value.trim();
    const topic = $("topic").value.trim();
    if (!content && !topic) { setNotice("Enter a question, topic, or notes first.", true); return; }
    const button = $("submit-learning");
    button.disabled = true;
    $("submit-label").textContent = state.action === "quiz" ? "Generating your quiz…" : "Working on your request…";
    setNotice("Preparing your study response. This may take a few seconds.");
    $("result-panel").hidden = true;
    try {
      if (state.action === "quiz") localStorage.removeItem(ATTEMPT_KEY);
      const data = await api("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          action: state.action,
          subject: $("subject").value.trim(),
          topic,
          content,
          level: user.educationTrack === "HIGHER" ? "higher institution / university" : "secondary school",
          questionCount: Number($("question-count").value),
          difficulty: $("quiz-difficulty").value
        })
      });
      if (state.action === "quiz") {
        if (!data.quiz || !data.attemptId || !Array.isArray(data.quiz.questions)) throw new Error("The server returned an incomplete quiz response. Please try again.");
        renderQuiz(data.quiz, data.attemptId);
      } else {
        state.answer = data.answer || "";
        $("result-content").textContent = data.answer || "No response was returned.";
        $("result-panel").hidden = false;
      }
      setNotice("Response ready. Review it alongside your school materials.");
      $("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setNotice(error.message || "The request could not be completed.", true);
    } finally {
      button.disabled = false;
      $("submit-label").textContent = taskCopy[state.action].button;
    }
  });

  async function resumeActiveQuiz() {
    const attemptId = localStorage.getItem(ATTEMPT_KEY);
    if (!attemptId) return;
    try {
      const data = await api("/api/ai/attempts/" + encodeURIComponent(attemptId));
      if (data.status === "COMPLETED" && data.result) {
        state.attemptId = data.attemptId;
        state.quiz = data.quiz;
        renderResults(data.result);
        $("result-panel").hidden = false;
        return;
      }
      setAction("quiz");
      renderQuiz(data.quiz, data.attemptId, data.submittedAnswers || []);
      if (data.feedbackByQuestion) state.feedbackByQuestion = data.feedbackByQuestion;
      $("result-panel").hidden = false;
      setNotice("Your unfinished quiz has been restored.");
    } catch {
      localStorage.removeItem(ATTEMPT_KEY);
    }
  }

  setAction("tutor");
  resumeActiveQuiz();
})();