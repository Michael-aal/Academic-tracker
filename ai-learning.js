(() => {
  "use strict";
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  if (!token) { window.location.replace("login.html"); return; }

  const $ = id => document.getElementById(id);
  const state = { action: "tutor", answer: "", speechUtterance: null, quiz: null };
  const SPEECH_SETTINGS_KEY = "academic-tracker-voice-settings";
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

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SPEECH_SETTINGS_KEY) || "{}");
      return { autoSpeak: saved.autoSpeak === true, voiceURI: typeof saved.voiceURI === "string" ? saved.voiceURI : "", rate: Math.min(1.2, Math.max(0.8, Number(saved.rate) || 1)) };
    } catch { return { autoSpeak: false, voiceURI: "", rate: 1 }; }
  }
  let speechSettings = readSettings();
  function saveSettings() { localStorage.setItem(SPEECH_SETTINGS_KEY, JSON.stringify(speechSettings)); }
  function speechSupported() { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }
  function setSpeechStatus(message) { $("speech-status").textContent = message; }
  function updateSpeechButtons() {
    const supported = speechSupported();
    $("speak-result").disabled = !supported || !state.answer;
    $("pause-speech").disabled = !supported || !window.speechSynthesis.speaking;
    $("pause-speech").textContent = supported && window.speechSynthesis.paused ? "Resume" : "Pause";
    $("stop-speech").disabled = !supported || !window.speechSynthesis.speaking;
  }
  function stopSpeech(message = "Playback stopped") {
    if (speechSupported()) window.speechSynthesis.cancel();
    state.speechUtterance = null;
    setSpeechStatus(message);
    updateSpeechButtons();
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  // Render a safe Markdown subset without a dependency. Code is preserved in the written answer.
  function renderMarkdown(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let paragraph = [], listType = "", listItems = [], codeLines = [], inCode = false, codeLang = "";
    const inline = value => {
      let safe = escapeHTML(value);
      const codeTokens = [];
      const tick = String.fromCharCode(96);
      const inlineCode = new RegExp(tick + "([^" + tick + "\n]+)" + tick, "g");
      safe = safe.replace(inlineCode, (_, code) => {
        const token = "\u0000CODE" + codeTokens.length + "\u0000";
        codeTokens.push("<code>" + code + "</code>");
        return token;
      });
      safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__(.+?)__/g, "<strong>$1</strong>");
      safe = safe.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
      safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return safe.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeTokens[Number(index)] || "");
    };
    const flushParagraph = () => { if (paragraph.length) { out.push("<p>" + inline(paragraph.join(" ")) + "</p>"); paragraph = []; } };
    const flushList = () => { if (listItems.length) { out.push("<" + listType + ">" + listItems.map(item => "<li>" + inline(item) + "</li>").join("") + "</" + listType + ">"); listItems = []; listType = ""; } };
    const flushCode = () => { out.push("<pre><code" + (codeLang ? ' class="language-' + escapeHTML(codeLang.replace(/[^a-z0-9_-]/gi, "")) + '"' : "") + ">" + escapeHTML(codeLines.join("\n")) + "</code></pre>"); codeLines = []; codeLang = ""; };
    for (const line of lines) {
      const fence = line.match(/^\s*\x60{3}\s*([\w+-]*)\s*$/);
      if (fence) {
        if (inCode) { flushCode(); inCode = false; }
        else { flushParagraph(); flushList(); inCode = true; codeLang = fence[1] || ""; }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }
      if (!line.trim()) { flushParagraph(); flushList(); continue; }
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
      if (heading) { flushParagraph(); flushList(); const level = heading[1].length; out.push("<h" + level + ">" + inline(heading[2].replace(/\s+#+\s*$/, "")) + "</h" + level + ">"); continue; }
      const item = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/);
      if (item) { flushParagraph(); const type = /^\s*\d+[.)]/.test(line) ? "ol" : "ul"; if (listType && listType !== type) flushList(); listType = type; listItems.push(item[1]); continue; }
      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) { flushParagraph(); flushList(); out.push("<blockquote><p>" + inline(quote[1]) + "</p></blockquote>"); continue; }
      flushList(); paragraph.push(line.trim());
    }
    flushParagraph(); flushList(); if (inCode) flushCode();
    return out.join("\n");
  }

  function getSpeechText() {
    const container = $("result-content").cloneNode(true);
    container.querySelectorAll("pre, code, button, script, style").forEach(node => node.remove());
    const hasCode = $("result-content").querySelector("pre code, p code, li code") !== null;
    let text = container.textContent || "";
    text = text
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/([.!?])(?=\S)/g, "$1 ")
      .replace(/[\t ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[\*#_~|]+/g, "")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([,;:])(?=\S)/g, "$1 ")
      .trim();
    if (hasCode && text) text = "I have included a code example in the written answer. I will focus on explaining the steps and ideas rather than reading the code character by character. " + text;
    if (!text && hasCode) text = "The written answer contains a code example. Review the code on screen and use the explanation alongside it to understand each step.";
    return text;
  }

  function populateVoices() {
    if (!speechSupported()) {
      $("speak-result").disabled = true; $("auto-speak").disabled = true; $("voice-select").disabled = true; $("speech-rate").disabled = true;
      setSpeechStatus("Voice playback is not supported in this browser.");
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    const select = $("voice-select");
    const previous = speechSettings.voiceURI;
    select.replaceChildren(new Option("System default voice", ""));
    voices.forEach(voice => select.add(new Option(voice.name + " (" + voice.lang + ")", voice.voiceURI)));
    select.value = voices.some(voice => voice.voiceURI === previous) ? previous : "";
    if (previous && !select.value) { speechSettings.voiceURI = ""; saveSettings(); }
  }

  function speakResult(automatic = false) {
    if (!speechSupported()) { setSpeechStatus("Voice is unavailable here. Try a browser that supports speech."); return; }
    const text = getSpeechText();
    if (!text) { setSpeechStatus("There is no explanation to read aloud."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = window.speechSynthesis.getVoices().find(item => item.voiceURI === speechSettings.voiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = speechSettings.rate;
    utterance.pitch = 1;
    utterance.onstart = () => { setSpeechStatus("Reading explanation aloud…"); updateSpeechButtons(); };
    utterance.onend = () => { state.speechUtterance = null; setSpeechStatus("Finished reading"); updateSpeechButtons(); };
    utterance.onerror = event => {
      state.speechUtterance = null;
      setSpeechStatus(event.error === "canceled" ? "Playback stopped" : "Voice playback could not start. Tap Listen to try again.");
      updateSpeechButtons();
    };
    state.speechUtterance = utterance;
    try {
      window.speechSynthesis.speak(utterance);
      if (automatic) setSpeechStatus("Starting voice playback…");
      updateSpeechButtons();
    } catch {
      setSpeechStatus("Voice playback could not start. Tap Listen to try again.");
      updateSpeechButtons();
    }
  }


  function stripQuizFormatting(value) {
    return String(value ?? "")
      .replace(/^\\s{0,3}#{1,6}\\s+/gm, "")
      .replace(/\\*\\*(.*?)\\*\\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/(^|[^*])\\*([^*\\n]+)\\*/g, "$1$2")
      .replace(/(^|[^_])_([^_\\n]+)_/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
  }

  function parseQuizAnswer(raw, expectedCount) {
    const cleaned = String(raw || "").trim().replace(/^```(?:json)?\\s*/i, "").replace(/\\s*```$/i, "");
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { throw new Error("The quiz came back in an unexpected format. Please generate it again."); }
    const list = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(list) || list.length !== expectedCount) {
      throw new Error("The AI did not return exactly " + expectedCount + " questions. Please generate the quiz again.");
    }
    return list.map((item, index) => {
      if (!item || typeof item !== "object" || typeof item.question !== "string") {
        throw new Error("Question " + (index + 1) + " is incomplete. Please generate the quiz again.");
      }
      const rawOptions = item.options;
      let entries;
      if (Array.isArray(rawOptions)) {
        if (rawOptions.length !== 4) throw new Error("Question " + (index + 1) + " must have four options.");
        entries = rawOptions.map((value, i) => [String.fromCharCode(65 + i), value]);
      } else if (rawOptions && typeof rawOptions === "object") {
        const keys = Object.keys(rawOptions);
        if (keys.length !== 4 || ["A", "B", "C", "D"].some(key => !Object.prototype.hasOwnProperty.call(rawOptions, key))) {
          throw new Error("Question " + (index + 1) + " must have options A, B, C and D.");
        }
        entries = ["A", "B", "C", "D"].map(key => [key, rawOptions[key]]);
      } else {
        throw new Error("Question " + (index + 1) + " has no valid options.");
      }
      const options = entries.map(([key, value]) => ({ key, text: stripQuizFormatting(value) }));
      if (options.some(option => !option.text) || new Set(options.map(option => option.key)).size !== 4) {
        throw new Error("Question " + (index + 1) + " has invalid options.");
      }
      const rawAnswer = String(item.answer ?? item.correctAnswer ?? "").trim();
      const answer = /^[A-D]$/i.test(rawAnswer) ? rawAnswer.toUpperCase() :
        (options.find(option => option.text.toLowerCase() === stripQuizFormatting(rawAnswer).toLowerCase()) || {}).key;
      if (!answer || !options.some(option => option.key === answer)) {
        throw new Error("Question " + (index + 1) + " has no valid correct answer.");
      }
      const question = stripQuizFormatting(item.question);
      if (!question) throw new Error("Question " + (index + 1) + " has no question text.");
      return { question, options, answer, explanation: stripQuizFormatting(item.explanation || "Review this topic in your notes for more detail.") };
    });
  }

  function renderQuiz() {
    const view = $("quiz-view");
    const quiz = state.quiz;
    if (!quiz) { view.hidden = true; return; }
    view.hidden = false;
    $("result-content").hidden = true;
    if (quiz.finished) {
      const score = quiz.questions.reduce((total, question, index) => total + (quiz.answers[index] === question.answer ? 1 : 0), 0);
      view.innerHTML = '<div class="quiz-finish"><span class="quiz-kicker">QUIZ COMPLETE</span><h4>You scored ' + score + ' out of ' + quiz.questions.length + '</h4><p>' +
        (score === quiz.questions.length ? 'Excellent work — you got every question right.' : score >= Math.ceil(quiz.questions.length * .7) ? 'Good progress. Review the questions you missed to strengthen your understanding.' : 'Keep practising. Read the explanations below, then try another round.') +
        '</p><div class="quiz-review">' + quiz.questions.map((q, i) => {
          const chosen = quiz.answers[i];
          const correct = chosen === q.answer;
          const chosenText = q.options.find(o => o.key === chosen)?.text || "Not answered";
          const answerText = q.options.find(o => o.key === q.answer)?.text || "";
          return '<article class="quiz-review-item"><strong>' + (i + 1) + '. ' + escapeHTML(q.question) + '</strong><p class="' + (correct ? 'quiz-correct-text' : 'quiz-wrong-text') + '">' +
            (correct ? 'Correct' : 'Your answer: ' + escapeHTML(chosenText)) + '</p>' +
            (correct ? '' : '<p>Correct answer: ' + escapeHTML(q.answer + '. ' + answerText) + '</p>') +
            '<p>' + escapeHTML(q.explanation) + '</p></article>';
        }).join("") + '</div><button class="quiz-next" type="button" data-quiz-restart>Try again</button></div>';
      return;
    }
    const i = quiz.index;
    const q = quiz.questions[i];
    const chosen = quiz.answers[i];
    const answered = Boolean(chosen);
    view.innerHTML = '<div class="quiz-progress-row"><span class="quiz-kicker">QUESTION ' + (i + 1) + ' OF ' + quiz.questions.length +
      '</span><span>' + Math.round(i / quiz.questions.length * 100) + '%</span></div><div class="quiz-progress"><span style="width:' +
      ((i + 1) / quiz.questions.length * 100) + '%"></span></div><h4 class="quiz-question">' + escapeHTML(q.question) +
      '</h4><div class="quiz-options-list">' + q.options.map(o => {
        const correct = o.key === q.answer;
        const selected = o.key === chosen;
        const cls = answered && correct ? ' is-correct' : answered && selected && !correct ? ' is-wrong' : '';
        return '<button class="quiz-option' + cls + (selected ? ' is-selected' : '') + '" type="button" data-quiz-option="' + o.key +
          '"' + (answered ? ' disabled' : '') + '><span class="quiz-option-letter">' + o.key + '</span><span>' + escapeHTML(o.text) +
          '</span>' + (answered && correct ? '<span class="quiz-option-mark" aria-label="Correct answer">✓</span>' : '') + '</button>';
      }).join("") + '</div>' + (answered
        ? '<div class="quiz-feedback ' + (chosen === q.answer ? 'feedback-correct' : 'feedback-wrong') + '"><strong>' +
          (chosen === q.answer ? 'That’s correct!' : 'Not quite — keep going.') + '</strong><p>Correct answer: ' +
          escapeHTML(q.answer + '. ' + q.options.find(o => o.key === q.answer).text) + '</p><p>' + escapeHTML(q.explanation) +
          '</p></div><button class="quiz-next" type="button" data-quiz-next>' +
          (i === quiz.questions.length - 1 ? 'See my score' : 'Next question') + ' <span aria-hidden="true">→</span></button>'
        : '<p class="quiz-hint">Choose one answer to see your feedback.</p>');
  }

  function handleQuizClick(event) {
    const option = event.target.closest("[data-quiz-option]");
    if (option && state.quiz && !state.quiz.finished && !state.quiz.answers[state.quiz.index]) {
      state.quiz.answers[state.quiz.index] = option.dataset.quizOption;
      renderQuiz();
      return;
    }
    if (event.target.closest("[data-quiz-next]") && state.quiz) {
      if (state.quiz.index >= state.quiz.questions.length - 1) state.quiz.finished = true;
      else state.quiz.index += 1;
      renderQuiz();
      $("quiz-view").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (event.target.closest("[data-quiz-restart]") && state.quiz) {
      state.quiz.index = 0;
      state.quiz.answers = [];
      state.quiz.finished = false;
      renderQuiz();
    }
  }

  $("quiz-view").addEventListener("click", handleQuizClick);

  function setAction(action) {
    stopSpeech("Ready to read aloud");
    state.action = action;
    state.quiz = null;
    $("quiz-view").hidden = true;
    $("quiz-view").innerHTML = "";
    $("result-content").hidden = false;
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
    $("voice-tools").hidden = action === "quiz";
    $("content").value = "";
    $("char-count").textContent = "0 / 12,000 characters";
    $("result-panel").hidden = true;
    $("notice").textContent = "";
    $("notice").classList.remove("error");
  }

  document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => setAction(button.dataset.action)));
  $("content").addEventListener("input", () => { $("char-count").textContent = $("content").value.length.toLocaleString() + " / 12,000 characters"; });
  $("signout").addEventListener("click", () => {
    stopSpeech();
    localStorage.removeItem("academic-tracker-token");
    localStorage.removeItem("academic-tracker-user");
    window.location.replace("login.html");
  });
  $("copy-result").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.answer);
      $("copy-result").textContent = "Copied";
      setTimeout(() => { $("copy-result").textContent = "Copy answer"; }, 1800);
    } catch { $("notice").textContent = "Copy was blocked by your browser. Select the answer and copy it manually."; }
  });
  $("speak-result").addEventListener("click", () => speakResult(false));
  $("pause-speech").addEventListener("click", () => {
    if (!speechSupported()) return;
    if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); setSpeechStatus("Resuming playback…"); }
    else if (window.speechSynthesis.speaking) { window.speechSynthesis.pause(); setSpeechStatus("Playback paused"); }
    updateSpeechButtons();
  });
  $("stop-speech").addEventListener("click", () => stopSpeech());
  $("auto-speak").checked = speechSettings.autoSpeak;
  $("auto-speak").addEventListener("change", () => { speechSettings.autoSpeak = $("auto-speak").checked; saveSettings(); });
  $("voice-select").addEventListener("change", () => { speechSettings.voiceURI = $("voice-select").value; saveSettings(); });
  $("speech-rate").value = String(speechSettings.rate);
  $("speech-rate-value").textContent = speechSettings.rate.toFixed(1).replace(/\.0$/, "") + "×";
  $("speech-rate").addEventListener("input", () => {
    speechSettings.rate = Number($("speech-rate").value);
    $("speech-rate-value").textContent = speechSettings.rate.toFixed(1).replace(/\.0$/, "") + "×";
    saveSettings();
  });
  if (speechSupported()) {
    populateVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", populateVoices);
  } else { populateVoices(); $("auto-speak").checked = false; }

  $("learning-form").addEventListener("submit", async event => {
    event.preventDefault();
    const content = $("content").value.trim();
    const topic = $("topic").value.trim();
    if (!content && !topic) { $("notice").textContent = "Enter a question, topic, or notes first."; $("notice").classList.add("error"); return; }
    const button = $("submit-learning");
    button.disabled = true;
    document.querySelectorAll("[data-action]").forEach(choice => { choice.disabled = true; });
    state.quiz = null;
    $("quiz-view").hidden = true;
    button.disabled = true; $("submit-label").textContent = "Working on your request…";
    $("notice").textContent = "Preparing your study response. This may take a few seconds.";
    $("notice").classList.remove("error");
    stopSpeech("Preparing your answer…");
    $("result-panel").hidden = true;
    try {
      const data = await api("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          action: state.action, subject: $("subject").value.trim(), topic, content,
          level: user.educationTrack === "HIGHER" ? "higher institution / university" : "secondary school",
          questionCount: Number($("question-count").value)
        })
      });
      if (typeof data.answer !== "string" || !data.answer.trim()) throw new Error("The AI returned an empty response. Please try again.");
      state.answer = data.answer;
      if (state.action === "quiz") {
        state.quiz = { questions: parseQuizAnswer(data.answer, Number($("question-count").value)), index: 0, answers: [], finished: false };
        $("result-content").innerHTML = "";
        $("result-content").hidden = true;
        renderQuiz();
      } else {
        state.quiz = null;
        $("quiz-view").hidden = true;
        $("result-content").hidden = false;
        $("result-content").innerHTML = renderMarkdown(data.answer);
      }
      $("result-panel").hidden = false;
      $("notice").textContent = "Response ready. Review it alongside your school materials.";
      updateSpeechButtons();
      $("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      if (speechSettings.autoSpeak && speechSupported() && state.action !== "quiz") speakResult(true);
    } catch (error) {
      $("notice").textContent = error.message || "The request could not be completed.";
      $("notice").classList.add("error");
    } finally {
      button.disabled = false;
      document.querySelectorAll("[data-action]").forEach(choice => { choice.disabled = false; });
      $("submit-label").textContent = taskCopy[state.action].button;
    }
  });

  setAction("tutor");
})();