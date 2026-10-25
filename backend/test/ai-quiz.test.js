"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { stripQuizMarkdown, validateQuizPayload } = require("../src/quiz-validation");

function makeQuestion(overrides = {}) {
  return {
    question: "What is 2 + 2?",
    options: { A: "3", B: "4", C: "5", D: "6" },
    answer: "B",
    explanation: "Adding two and two gives four.",
    ...overrides
  };
}

test("validates the requested number of four-option questions", () => {
  const result = validateQuizPayload(JSON.stringify({ questions: [makeQuestion(), makeQuestion({ question: "What is 3 + 3?", answer: "C", options: { A: "5", B: "7", C: "6", D: "8" } })] }), 2);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(Object.keys(result.questions[0].options), ["A", "B", "C", "D"]);
  assert.equal(result.questions[0].answer, "B");
});

test("rejects a response with fewer questions than requested", () => {
  assert.throws(() => validateQuizPayload({ questions: [makeQuestion()] }, 3), /requested number of questions/);
});

test("rejects missing or extra option keys", () => {
  assert.throws(() => validateQuizPayload({ questions: [makeQuestion({ options: { A: "one", B: "two", C: "three" } })] }, 1), /four options|options A, B, C and D/);
  assert.throws(() => validateQuizPayload({ questions: [makeQuestion({ options: { A: "one", B: "two", C: "three", D: "four", E: "five" } })] }, 1), /options A, B, C and D only/);
});

test("rejects an answer key that does not exist", () => {
  assert.throws(() => validateQuizPayload({ questions: [makeQuestion({ answer: "E" })] }, 1), /valid correct answer/);
});

test("removes Markdown from displayed quiz text", () => {
  const tick = String.fromCharCode(96);
  const result = validateQuizPayload({ questions: [makeQuestion({ question: "## **What** is " + tick + "2 + 2" + tick + "?", options: { A: "**3**", B: "4", C: "5", D: "6" } })] }, 1);
  assert.equal(result.questions[0].question, "What is 2 + 2?");
  assert.equal(result.questions[0].options.A, "3");
  assert.equal(stripQuizMarkdown("## **Important**"), "Important");
});

test("rejects malformed JSON", () => {
  assert.throws(() => validateQuizPayload("{bad json", 1), /invalid quiz data/);
});
