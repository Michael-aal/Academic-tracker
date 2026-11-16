(() => {
  "use strict";
  const panel = document.getElementById("result-panel");
  const host = document.getElementById("result-content");
  if (!panel || !host) return;
  let scheduled = false;
  const scrollToLatestReply = () => {
    if (scheduled || panel.hidden) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scheduled = false;
      if (panel.hidden) return;
      const replies = host.querySelectorAll(".tutor-message-tutor");
      const latest = replies[replies.length - 1];
      if (latest) latest.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }));
  };
  const observer = new MutationObserver(scrollToLatestReply);
  observer.observe(host, { childList: true, subtree: true });
  observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  if (!panel.hidden) scrollToLatestReply();
})();