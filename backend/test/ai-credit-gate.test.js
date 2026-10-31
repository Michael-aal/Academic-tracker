"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateCredits, aiCreditGate } = require("../src/ai-credit-gate");
const { prisma } = require("../src/prisma");

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

test("zero-credit accounts are blocked at the API gate instead of falling back to free quota", async () => {
  const originalTransaction = prisma.$transaction;
  const fakeTx = {
    $queryRaw: async () => [],
    creditLot: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 })
    },
    creditWallet: {
      upsert: async ({ create }) => create
    }
  };
  prisma.$transaction = async callback => callback(fakeTx);
  const req = { userId: "free-account-with-zero-wallet", body: { action: "tutor", content: "Explain gravity." } };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalled = false;
  try {
    await aiCreditGate(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 402);
    assert.equal(res.body.code, "INSUFFICIENT_AI_CREDITS");
    assert.equal(res.body.balance, 0);
    assert.equal(nextCalled, false);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});
