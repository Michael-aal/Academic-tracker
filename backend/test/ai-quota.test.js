const test = require("node:test");
const assert = require("node:assert/strict");
const { consumeAiQuota, WINDOW_MS, DEFAULT_LIMIT } = require("../src/ai-quota");

function fakePrisma() {
  const state = { events: [], locks: 0, cleanupCalls: 0 };
  const tx = {
    $queryRaw: async () => { state.locks += 1; return [{ id: "student-1" }]; },
    aiUsageEvent: {
      count: async ({ where }) => {
        assert.equal(where.userId, "student-1");
        return state.events.filter(event => event.createdAt > where.createdAt.gt).length;
      },
      create: async ({ data }) => { state.events.push(data); return data; }
    }
  };
  return {
    state,
    $transaction: async callback => callback(tx),
    aiUsageEvent: { deleteMany: async () => { state.cleanupCalls += 1; return { count: 0 }; } }
  };
}

test("AI quota permits up to ten requests in a rolling 15-minute window", async () => {
  const db = fakePrisma();
  const now = new Date("2026-10-30T12:07:00.000Z");
  for (let i = 0; i < DEFAULT_LIMIT; i += 1) {
    assert.equal(await consumeAiQuota(db, "student-1", new Date(now.getTime() + i * 1000)), true);
  }
  assert.equal(await consumeAiQuota(db, "student-1", new Date(now.getTime() + 10000)), false);
  assert.equal(db.state.events.length, DEFAULT_LIMIT);
  assert.equal(db.state.locks, DEFAULT_LIMIT + 1);
});

test("AI quota releases capacity when an earlier request leaves the rolling window", async () => {
  const db = fakePrisma();
  const now = new Date("2026-10-30T12:07:00.000Z");
  for (let i = 0; i < DEFAULT_LIMIT; i += 1) {
    assert.equal(await consumeAiQuota(db, "student-1", new Date(now.getTime() + i * 1000)), true);
  }
  assert.equal(await consumeAiQuota(db, "student-1", new Date(now.getTime() + WINDOW_MS + 1000)), true);
});

test("AI quota propagates database failures instead of bypassing the limit", async () => {
  const db = fakePrisma();
  db.$transaction = async () => { throw new Error("database unavailable"); };
  await assert.rejects(() => consumeAiQuota(db, "student-1"), /database unavailable/);
});
