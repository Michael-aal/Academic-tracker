(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const message = $("content");
  const form = $("learning-form");
  const welcome = $("tutor-welcome");
  const resultPanel = $("result-panel");
  if (!message || !form) return;

  const syncConversationView = () => {
    const hasConversation = resultPanel && !resultPanel.hidden && Boolean($("result-content")?.children.length);
    if (welcome) welcome.hidden = Boolean(hasConversation);
    if (hasConversation) {
      if ($("task-title")) $("task-title").textContent = "Keep learning together";
      if ($("task-description")) $("task-description").textContent = "Ask a follow-up or request another explanation.";
    }
  };
  if (resultPanel) {
    new MutationObserver(syncConversationView).observe(resultPanel, { attributes: true, attributeFilter: ["hidden"] });
    const host = $("result-content");
    if (host) new MutationObserver(syncConversationView).observe(host, { childList: true });
  }

  document.querySelectorAll("[data-tutor-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      message.value = button.dataset.tutorPrompt || "";
      message.focus();
      message.dispatchEvent(new Event("input", { bubbles: true }));
      message.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  const attach = $("tutor-attach");
  const fileInput = $("tutor-attachment");
  attach?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Choose a notes file smaller than 1 MB.");
      const text = await file.text();
      if (!text.trim()) throw new Error("That file does not contain readable text.");
      const remaining = 12000 - message.value.length;
      if (remaining <= 0) throw new Error("The message has reached its 12,000-character limit.");
      const excerpt = text.trim().slice(0, remaining);
      const prefix = message.value.trim() ? message.value.trim() + "\n\n" : "";
      message.value = prefix + "Notes from " + file.name + ":\n" + excerpt;
      message.dispatchEvent(new Event("input", { bubbles: true }));
      message.focus();
    } catch (error) {
      const notice = $("notice");
      if (notice) { notice.textContent = error.message; notice.classList.add("error"); }
    } finally {
      fileInput.value = "";
    }
  });

  const voiceButton = $("tutor-voice");
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  if (voiceButton && Recognition) {
    recognition = new Recognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = event => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        const joiner = message.value.trim() ? " " : "";
        message.value = (message.value + joiner + transcript).slice(0, 12000);
        message.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    recognition.onerror = () => {
      const notice = $("notice");
      if (notice) notice.textContent = "Voice input was unavailable. You can type your message instead.";
    };
    recognition.onend = () => {
      voiceButton.classList.remove("is-recording");
      voiceButton.setAttribute("aria-pressed", "false");
    };
    voiceButton.addEventListener("click", () => {
      try {
        if (voiceButton.classList.contains("is-recording")) recognition.stop();
        else {
          recognition.start();
          voiceButton.classList.add("is-recording");
          voiceButton.setAttribute("aria-pressed", "true");
        }
      } catch {
        voiceButton.classList.remove("is-recording");
        voiceButton.setAttribute("aria-pressed", "false");
      }
    });
  } else if (voiceButton) {
    voiceButton.disabled = true;
    voiceButton.title = "Voice input is not supported in this browser";
  }

  message.addEventListener("input", () => {
    message.style.height = "auto";
    message.style.height = Math.min(message.scrollHeight, 160) + "px";
  });
  syncConversationView();
})();