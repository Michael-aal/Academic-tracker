"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateCredits, aiCreditGate, ensureFreeCredits, FREE_CREDIT_ALLOWANCE, FREE_CREDIT_INTERVAL_MS } = require("../src/ai-credit-gate");
const { prisma } = require("../src/prisma");

test("AI actions use the published fixed credit costs regardless of prompt size", () => {
  assert.equal(estimateCredits({ action: "tutor", content: "Explain photosynthesis." }), 2);
  assert.equal(estimateCredits({ action: "tutor", content: "x".repeat(12000) }), 2);
  assert.equal(estimateCredits({ action: "quiz", content: "Cell biology", questionCount: 10 }), 3);
  assert.equal(estimateCredits({ action: "summarize", content: "x".repeat(12000) }), 2);
  assert.equal(estimateCredits({ action: "study-plan", topic: "Algebra" }), 2);
  assert.equal(estimateCredits({ action: "flashcards", topic: "Cell biology", cardCount: 20 }), 2);
  assert.equal(estimateCredits({ action: "english", topic: "parts of speech" }), 1);
});



test("Free accounts receive 60 credits once per 72-hour window", async () => {
  const originalTransaction = prisma.$transaction;
  const now = new Date("2026-10-31T12:00:00.000Z");
  let lotData = null;
  let ledgerData = null;
  let walletData = null;
  const fakeTx = {
    $queryRaw: async () => [],
    premiumAccess: { findUnique: async () => null },
    creditLedger: {
      findFirst: async () => null,
      create: async ({ data }) => { ledgerData = data; }
    },
    creditLot: {
      create: async ({ data }) => { lotData = data; },
      aggregate: async () => ({ _sum: { remainingCredits: FREE_CREDIT_ALLOWANCE } })
    },
    creditWallet: { upsert: async ({ create, update }) => { walletData = create || update; } }
  };
  prisma.$transaction = async callback => callback(fakeTx);
  try {
    const result = await ensureFreeCredits("free-user", now);
    assert.equal(result.granted, true);
    assert.equal(result.amount, 60);
    assert.equal(lotData.originalCredits, 60);
    assert.equal(lotData.remainingCredits, 60);
    assert.equal(lotData.expiresAt.getTime(), now.getTime() + FREE_CREDIT_INTERVAL_MS);
    assert.equal(ledgerData.kind, "FREE_REFRESH");
    assert.equal(ledgerData.delta, 60);
    assert.ok(walletData);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("Free refresh does not stack or grant early inside the 72-hour window", async () => {
  const originalTransaction = prisma.$transaction;
  const now = new Date("2026-10-31T12:00:00.000Z");
  const previousGrant = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let created = false;
  const fakeTx = {
    $queryRaw: async () => [],
    premiumAccess: { findUnique: async () => null },
    creditLedger: { findFirst: async () => ({ createdAt: previousGrant }) },
    creditLot: { create: async () => { created = true; } },
    creditWallet: { upsert: async () => { created = true; } }
  };
  prisma.$transaction = async callback => callback(fakeTx);
  try {
    const result = await ensureFreeCredits("free-user", now);
    assert.equal(result.granted, false);
    assert.equal(result.nextRefreshAt.getTime(), previousGrant.getTime() + FREE_CREDIT_INTERVAL_MS);
    assert.equal(created, false);
  } finally {
    prisma.$transaction = originalTransaction;
  }
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
