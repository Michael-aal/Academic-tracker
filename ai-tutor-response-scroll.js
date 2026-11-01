(() => {
  "use strict";
  const panel = document.getElementById("result-panel");
  const host = document.getElementById("result-content");
  if (!panel || !host) return;

  let scheduled = false;
  const scrollToLatestTutorReply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduled = false;
        if (panel.hidden) return;
        const replies = host.querySelectorAll(".tutor-message-tutor");
        const latestReply = replies[replies.length - 1];
        if (latestReply) {
          latestReply.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
        }
      });
    });
  };

  const observer = new MutationObserver(scrollToLatestTutorReply);
  observer.observe(host, { childList: true, subtree: true });
  observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  if (!panel.hidden) scrollToLatestTutorReply();
})();