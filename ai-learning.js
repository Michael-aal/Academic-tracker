(() => {
  "use strict";
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  if (!token) { window.location.replace("login.html"); return; }

  const $ = (id) => document.getElementById(id);
  const state = { action: "tutor", answer: "" };
  const taskCopy = {
    tutor: { title: "Ask your tutor", description: "Tell me what you're learning and where you're stuck.", label: "What would you like help understanding?", placeholder: "e.g. Explain Newton's second law and show me a simple example…", button: "Help me understand", result: "Your explanation", required: true },
    quiz: { title: "Build a revision quiz", description: "Create practice questions from a topic or your own notes.", label: "Paste your notes or describe the topic", placeholder: "Paste your notes here, or describe the topic you want to practise…", button: "Generate my quiz", result: "Your practice quiz", required: true },
    summarize: { title: "Summarize my notes", description: "Make revision easier by finding the key ideas.", label: "Paste the notes you want to revise", placeholder: "Paste your lesson notes here…", button: "Summarize my notes", result: "Revision summary", required: true },
    "study-plan": { title: "Plan my study week", description: "Break a topic into small, manageable study sessions.", label: "What do you need to study?", placeholder: "Tell me the subjects, topics, and any test date you want to prepare for…", button: "Create my study plan", result: "Your 7-day study plan", required: true }
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
    $("content").value = "";
    $("char-count").textContent = "0 / 12,000 characters";
    $("result-panel").hidden = true;
    $("notice").textContent = "";
    $("notice").classList.remove("error");
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
    } catch { $("notice").textContent = "Copy was blocked by your browser. Select the answer and copy it manually."; }
  });

  $("learning-form").addEventListener("submit", async event => {
    event.preventDefault();
    const content = $("content").value.trim();
    const topic = $("topic").value.trim();
    if (!content && !topic) { $("notice").textContent = "Enter a question, topic, or notes first."; $("notice").classList.add("error"); return; }
    const button = $("submit-learning");
    button.disabled = true; $("submit-label").textContent = "Working on your request…";
    $("notice").textContent = "Preparing your study response. This may take a few seconds.";
    $("notice").classList.remove("error");
    $("result-panel").hidden = true;
    try {
      const data = await api("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          action: state.action,
          subject: $("subject").value.trim(),
          topic,
          content,
          level: user.educationTrack === "HIGHER" ? "higher institution / university" : "secondary school",
          questionCount: Number($("question-count").value)
        })
      });
      state.answer = data.answer;
      $("result-content").textContent = data.answer;
      $("result-panel").hidden = false;
      $("notice").textContent = "Response ready. Review it alongside your school materials.";
      $("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      $("notice").textContent = error.message || "The request could not be completed.";
      $("notice").classList.add("error");
    } finally {
      button.disabled = false;
      $("submit-label").textContent = taskCopy[state.action].button;
    }
  });

  setAction("tutor");
})();
