(() => {
  "use strict";
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  if (!token) { window.location.replace("login.html"); return; }

  const $ = id => document.getElementById(id);
  const ATTEMPT_KEY = "academic-tracker-active-quiz";
  const state = { action: "tutor", answer: "", conversation: [], quiz: null, attemptId: null, index: 0, selected: {}, answered: {}, submitted: false, result: null };
  const taskCopy = {
    tutor: { title: "Talk to your AI tutor", description: "Ask questions, paste your class notes, and keep asking until it makes sense.", label: "What should we learn together?", placeholder: "Ask a question, paste your notes, or ask me to explain something more simply…", button: "Ask tutor", result: "Your tutoring conversation" },
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


  function appendInlineMarkdown(parent, value) {
    const pattern = /(`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(value))) {
      if (match.index > cursor) parent.append(document.createTextNode(value.slice(cursor, match.index)));
      const token = match[0];
      let node;
      if (token.startsWith("`")) {
        node = document.createElement("code");
        node.textContent = token.slice(1, -1);
      } else if (token.startsWith("**")) {
        node = document.createElement("strong");
        node.textContent = token.slice(2, -2);
      } else {
        node = document.createElement("em");
        node.textContent = token.slice(1, -1);
      }
      parent.append(node);
      cursor = match.index + token.length;
    }
    if (cursor < value.length) parent.append(document.createTextNode(value.slice(cursor)));
  }

  function renderSafeMarkdown(host, markdown) {
    host.replaceChildren();
    const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
    let paragraph = [];
    let list = null;
    let codeLines = null;
    const flushParagraph = () => {
      if (!paragraph.length) return;
      const p = document.createElement("p");
      appendInlineMarkdown(p, paragraph.join(" "));
      host.append(p);
      paragraph = [];
    };
    const flushList = () => {
      if (list) { host.append(list); list = null; }
    };
    lines.forEach(line => {
      if (/^\s*```/.test(line)) {
        flushParagraph(); flushList();
        if (codeLines) {
          const pre = document.createElement("pre");
          const code = document.createElement("code");
          code.textContent = codeLines.join("\n");
          pre.append(code); host.append(pre); codeLines = null;
        } else codeLines = [];
        return;
      }
      if (codeLines) { codeLines.push(line); return; }
      if (!line.trim()) { flushParagraph(); flushList(); return; }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        flushParagraph(); flushList();
        const h = document.createElement("h" + heading[1].length);
        appendInlineMarkdown(h, heading[2].trim());
        host.append(h);
        return;
      }
      const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
      const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (unordered || ordered) {
        flushParagraph();
        const type = unordered ? "ul" : "ol";
        if (!list || list.tagName.toLowerCase() !== type) {
          flushList(); list = document.createElement(type);
        }
        const item = document.createElement("li");
        appendInlineMarkdown(item, (unordered || ordered)[1]);
        list.append(item);
        return;
      }
      flushList();
      paragraph.push(line.trim());
    });
    flushParagraph(); flushList();
    if (codeLines) {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.append(code); host.append(pre);
    }
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
    if (state.action !== action) state.conversation = [];
    state.action = action;
    const copy = taskCopy[action];
    document.querySelectorAll("[data-action]").forEach(button => button.classList.toggle("active", button.dataset.action === action));
    $("task-title").textContent = copy.title;
    $("task-description").textContent = copy.description;
    $("content-label").textContent = copy.label;
    $("content").placeholder = copy.placeholder;
    $("submit-label").textContent = copy.button;
    $("result-title").textContent = copy.result;
    const quizOptions = $("quiz-options");
    if (quizOptions) quizOptions.hidden = action !== "quiz";
    $("copy-result").hidden = action === "quiz";
    $("content").value = "";
    $("char-count").textContent = "0 / 12,000 characters";
    $("result-panel").hidden = true;
    setNotice("");
  }

  function renderTutorConversation(host, videoQuery, subject) {
    host.replaceChildren();
    state.conversation.forEach((message, index) => {
      const card = el("article", "tutor-message tutor-message-" + message.role);
      card.append(el("p", "tutor-message-label", message.role === "student" ? "YOU" : "AI TUTOR"));
      const body = el("div", "tutor-message-body");
      renderSafeMarkdown(body, message.content);
      card.append(body);
      if (message.role === "tutor" && index === state.conversation.length - 1) {
        const query = [subject, videoQuery].filter(Boolean).join(" ").slice(0, 180);
        if (query) {
          const link = el("a", "tutor-video-link", "▶ Watch a related educational video");
          link.href = "educational-videos.html?search=" + encodeURIComponent(query) + (subject ? "&subject=" + encodeURIComponent(subject) : "");
          card.append(link);
        }
      }
      host.append(card);
    });
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
      else { hintText.replaceChildren(); appendInlineMarkdown(hintText, question.hint); }
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
      const questionTitle = card.querySelector(".question-title");
      questionTitle.replaceChildren();
      appendInlineMarkdown(questionTitle, question.question);
      optionHost.replaceChildren();
      question.options.forEach(option => {
        const button = el("button", "answer-option");
        button.type = "button";
        button.dataset.optionId = option.id;
        button.setAttribute("aria-pressed", String(state.selected[question.id] === option.id || state.answered[question.id] === option.id));
        const letter = el("span", "answer-letter", option.id);
        const text = el("span", "answer-text");
        appendInlineMarkdown(text, option.text);
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
      feedback.replaceChildren();
      feedback.append(document.createTextNode(data.isCorrect ? "Correct. " : "Not quite. Correct answer: " + data.correctAnswer + ". "));
      appendInlineMarkdown(feedback, data.explanation);
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
      card.append(el("p", "question-meta", "QUESTION " + (index + 1)));
      const reviewQuestion = el("h5", "question-title");
      appendInlineMarkdown(reviewQuestion, item.question);
      card.append(reviewQuestion);
      const yourAnswer = el("p", "review-line");
      yourAnswer.append(document.createTextNode("Your answer: "));
      appendInlineMarkdown(yourAnswer, item.selectedText || "Not answered");
      card.append(yourAnswer);
      const correctAnswer = el("p", "review-line");
      correctAnswer.append(document.createTextNode("Correct answer: " + item.correctAnswer + ". "));
      appendInlineMarkdown(correctAnswer, item.correctText);
      card.append(correctAnswer);
      const explanation = el("p", "review-explanation");
      appendInlineMarkdown(explanation, item.explanation);
      card.append(explanation);
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
      $("learning-form").scrollIntoView({ behavior: "smooth", block: "start" });
      $("submit-learning").click();
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
  $("copy-result").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("result-content").innerText || $("result-content").textContent || state.answer);
      $("copy-result").textContent = "Copied";
      setTimeout(() => { $("copy-result").textContent = "Copy answer"; }, 1800);
    } catch { setNotice("Copy was blocked by your browser. Select the answer and copy it manually.", true); }
  });

  $("learning-form").addEventListener("submit", async event => {
    event.preventDefault();
    const content = $("content").value.trim();
    const topic = $("topic").value.trim();
    if ((!content && !topic) || (state.action === "tutor" && state.conversation.length && !content)) { setNotice(state.action === "tutor" && state.conversation.length ? "Ask a follow-up question or paste the next part of your notes first." : "Enter a question, topic, or notes first.", true); return; }
    const button = $("submit-learning");
    button.disabled = true;
    $("submit-label").textContent = state.action === "quiz" ? "Generating your quiz…" : "Working on your request…";
    setNotice("Preparing your study response. This may take a few seconds.");
    $("result-panel").hidden = true;
    try {
      if (state.action === "quiz") localStorage.removeItem(ATTEMPT_KEY);
      const history = state.action === "tutor" ? state.conversation.slice(-8).map(message => (message.role === "student" ? "Student" : "Tutor") + ":\n" + message.content).join("\n\n") : "";
      const requestContent = history ? (history + "\n\nStudent's latest message:\n" + content).slice(-12000) : content;
      const data = await api("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          action: state.action,
          subject: $("subject").value.trim(),
          topic,
          content: requestContent,
          level: user.educationTrack === "HIGHER" ? "higher institution / university" : "secondary school",
          questionCount: Number($("question-count")?.value || 5),
          difficulty: $("quiz-difficulty")?.value || "medium"
        })
      });
      if (state.action === "quiz") {
        const expectedCount = Number($("question-count").value);
        const validQuiz = data.quiz && typeof data.quiz.title === "string" && Array.isArray(data.quiz.questions) && data.quiz.questions.length === expectedCount && data.quiz.questions.every(question => question && typeof question.id === "string" && typeof question.question === "string" && Array.isArray(question.options) && question.options.length === 4 && question.options.every(option => option && typeof option.id === "string" && typeof option.text === "string"));
        if (!validQuiz || typeof data.attemptId !== "string" || !data.attemptId) {
          console.error("Quiz API returned an unexpected response shape.", { hasQuiz: Boolean(data.quiz), hasAttemptId: Boolean(data.attemptId), questionCount: Array.isArray(data.quiz?.questions) ? data.quiz.questions.length : null, expectedCount });
          throw new Error("The quiz service returned incomplete data. Please try once more. If it keeps happening, the backend deployment needs updating.");
        }
        localStorage.setItem(ATTEMPT_KEY, data.attemptId);
        window.location.assign("quiz.html?attempt=" + encodeURIComponent(data.attemptId));
        return;
      } else {
        state.answer = data.answer || "No response was returned.";
        if (state.action === "tutor") {
          state.conversation.push({ role: "student", content: content || topic });
          state.conversation.push({ role: "tutor", content: state.answer });
          renderTutorConversation($("result-content"), topic || content, $("subject").value.trim());
          $("result-title").textContent = "Your tutoring conversation";
          $("content").value = "";
          $("content").placeholder = "Ask a follow-up question or paste another part of your notes…";
          $("char-count").textContent = "0 / 12,000 characters";
        } else {
          renderSafeMarkdown($("result-content"), state.answer);
        }
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
    if (!attemptId || new URLSearchParams(window.location.search).get("new") === "1") return;
    window.location.replace("quiz.html?attempt=" + encodeURIComponent(attemptId));
  }

  const initialTool = document.body.dataset.aiTool || "tutor";
  setAction(taskCopy[initialTool] ? initialTool : "tutor");
  if (initialTool === "quiz") resumeActiveQuiz();
})();