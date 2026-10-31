"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateCredits } = require("../src/ai-credit-gate");

test("AI reservations are positive and increase for larger generation workloads", () => {
  const previous = {
    AI_CREDIT_RATES_JSON: process.env.AI_CREDIT_RATES_JSON,
    AI_PROVIDER_ORDER: process.env.AI_PROVIDER_ORDER
  };
  try {
    process.env.AI_PROVIDER_ORDER = "openrouter,xai";
    process.env.AI_CREDIT_RATES_JSON = JSON.stringify({
      openrouter: { inputPer1k: 1, outputPer1k: 2 },
      xai: { inputPer1k: 2, outputPer1k: 3 }
    });
    const tutor = estimateCredits({ action: "tutor", content: "Explain photosynthesis." });
    const quiz = estimateCredits({ action: "quiz", content: "Cell biology", questionCount: 10 });
    const flashcards = estimateCredits({ action: "flashcards", content: "Cell biology", cardCount: 20 });
    assert.ok(Number.isSafeInteger(tutor) && tutor > 0);
    assert.ok(quiz > tutor);
    assert.ok(flashcards > tutor);
  } finally {
    if (previous.AI_CREDIT_RATES_JSON === undefined) delete process.env.AI_CREDIT_RATES_JSON;
    else process.env.AI_CREDIT_RATES_JSON = previous.AI_CREDIT_RATES_JSON;
    if (previous.AI_PROVIDER_ORDER === undefined) delete process.env.AI_PROVIDER_ORDER;
    else process.env.AI_PROVIDER_ORDER = previous.AI_PROVIDER_ORDER;
  }
});

test("AI reservation estimates honor exact-model rate overrides", () => {
  const previous = process.env.AI_CREDIT_RATES_JSON;
  try {
    process.env.AI_CREDIT_RATES_JSON = JSON.stringify({ openrouter: { inputPer1k: 1, outputPer1k: 2 } });
    const normal = estimateCredits({ action: "tutor", content: "Explain energy." });
    process.env.AI_CREDIT_RATES_JSON = JSON.stringify({
      openrouter: {
        inputPer1k: 1, outputPer1k: 2,
        models: { "expensive-model": { inputPer1k: 100, outputPer1k: 200 } }
      }
    });
    const highRate = estimateCredits({ action: "tutor", content: "Explain energy." });
    assert.ok(highRate > normal);
  } finally {
    if (previous === undefined) delete process.env.AI_CREDIT_RATES_JSON;
    else process.env.AI_CREDIT_RATES_JSON = previous;
  }
});
