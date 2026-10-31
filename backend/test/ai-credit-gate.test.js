"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateCredits, aiCreditGate } = require("../src/ai-credit-gate");
const { prisma } = require("../src/prisma");

test("AI actions use the published fixed credit costs regardless of prompt size", () => {
  assert.equal(estimateCredits({ action: "tutor", content: "Explain photosynthesis." }), 2);
  assert.equal(estimateCredits({ action: "tutor", content: "x".repeat(12000) }), 2);
  assert.equal(estimateCredits({ action: "quiz", content: "Cell biology", questionCount: 10 }), 3);
  assert.equal(estimateCredits({ action: "summarize", content: "x".repeat(12000) }), 2);
  assert.equal(estimateCredits({ action: "study-plan", topic: "Algebra" }), 2);
  assert.equal(estimateCredits({ action: "flashcards", topic: "Cell biology", cardCount: 20 }), 2);
});


test("zero-credit accounts are blocked at the API gate instead of falling back to free quota", async () => {
  const originalTransaction = prisma.$transaction;
  const fakeTx = {
    $queryRaw: async () => [],
    premiumAccess: { findUnique: async () => null },
    creditLedger: { findFirst: async () => ({ createdAt: new Date() }) },
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
