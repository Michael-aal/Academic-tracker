(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const message = $("content");
  const form = $("learning-form");
  const welcome = $("tutor-welcome");
  const topic = $("topic");
  const subject = $("subject");
  if (!message || !form) return;

  // Compact, growing composer: expand with content and scroll only after the cap.
  const maxComposerHeight = 180;
  const resizeComposer = () => {
    message.style.height = "auto";
    const nextHeight = Math.min(message.scrollHeight, maxComposerHeight);
    message.style.height = nextHeight + "px";
    message.style.overflowY = message.scrollHeight > maxComposerHeight ? "auto" : "hidden";
  };
  message.addEventListener("input", resizeComposer);
  message.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!message.value.trim()) return;
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  resizeComposer();

  const updateFocus = () => {
    const parts = [subject?.value?.trim(), topic?.value?.trim()].filter(Boolean);
  };
  subject?.addEventListener("input", updateFocus);
  topic?.addEventListener("input", updateFocus);

  document.querySelectorAll("[data-tutor-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      message.value = button.dataset.tutorPrompt || "";
      message.focus();
      message.dispatchEvent(new Event("input", { bubbles: true }));
      message.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  const resultPanel = $("result-panel");
  const syncConversationView = () => {
    const hasConversation = !resultPanel.hidden && Boolean($("result-content")?.children.length);
    welcome.hidden = hasConversation;
    if (hasConversation) {
      $("task-title").textContent = "Keep learning together";
      $("task-description").textContent = "Ask a follow-up or request another explanation.";
    }
  };
  if (resultPanel) {
    new MutationObserver(syncConversationView).observe(resultPanel, { attributes: true, attributeFilter: ["hidden"] });
    const content = $("result-content");
    if (content) new MutationObserver(syncConversationView).observe(content, { childList: true });
  }
  updateFocus();
})();