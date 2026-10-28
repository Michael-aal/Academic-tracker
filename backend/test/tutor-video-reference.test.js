"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTutorVideoReference } = require("../src/services/tutor-video-reference");

test("builds a video search using the subject and learning topic", () => {
  const reference = buildTutorVideoReference({ subject: "Physics", topic: "Newton's laws" });
  assert.equal(reference.kind, "educational_video_search");
  assert.match(reference.query, /Physics/);
  assert.match(reference.query, /Newton's laws/);
  assert.match(reference.href, /^educational-videos\.html\?search=/);
  assert.match(reference.href, /subject=Physics/);
});

test("uses the latest student message when no topic is provided", () => {
  const reference = buildTutorVideoReference({ subject: "Mathematics", latestMessage: "Explain simultaneous equations" });
  assert.match(reference.query, /Explain simultaneous equations/);
});

test("returns no reference when no learning context is available", () => {
  assert.equal(buildTutorVideoReference({}), null);
});

test("bounds and cleans user-provided context", () => {
  const reference = buildTutorVideoReference({ subject: "Science<bad>", topic: "  cells\n and tissues  " });
  assert.ok(reference.query.length <= 180);
  assert.doesNotMatch(reference.query, /<|>/);
  assert.match(reference.query, /cells and tissues/);
});
