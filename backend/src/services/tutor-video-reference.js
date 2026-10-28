"use strict";

const MAX_QUERY_LENGTH = 180;

function buildTutorVideoReference({ subject = "", topic = "", latestMessage = "" } = {}) {
  const clean = value => typeof value === "string"
    ? value.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim()
    : "";

  const safeSubject = clean(subject).slice(0, 100);
  const safeTopic = clean(topic).slice(0, 120);
  const safeMessage = clean(latestMessage).slice(0, 100);

  // Prefer the learner's explicit topic; use their latest question only as a fallback.
  const learningFocus = safeTopic || safeMessage;
  const query = [safeSubject, learningFocus, "educational lesson explained"].filter(Boolean).join(" ").slice(0, MAX_QUERY_LENGTH);

  if (!query) return null;

  return {
    kind: "educational_video_search",
    label: "Find a video lesson for this explanation",
    query,
    href: "educational-videos.html?search=" + encodeURIComponent(query) +
      (safeSubject ? "&subject=" + encodeURIComponent(safeSubject) : "")
  };
}

module.exports = { buildTutorVideoReference };
