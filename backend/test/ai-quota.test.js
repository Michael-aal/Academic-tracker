const test = require("node:test");
const assert = require("node:assert/strict");
const { consumeAiQuota, WINDOW_MS, DEFAULT_LIMIT } = require("../src/ai-quota");

function fakePrisma(returns) {
  const calls = [];
  return {
    calls,
    $queryRaw(strings, ...values) {
      calls.push({ sql: strings.join("?"), values });
      return Promise.resolve(returns);
    },
    aiUsageWindow: { deleteMany: async () => ({ count: 0 }) }
  };
}

test("AI quota uses an atomic PostgreSQL upsert and a fixed 15-minute window", async () => {
  const now = new Date("2026-10-30T12:07:00.000Z");
  const db = fakePrisma([{ request_count: 1 }]);
  assert.equal(await consumeAiQuota(db, "student-1", now), true);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /ON CONFLICT/);
  assert.match(db.calls[0].sql, /request_count.*< \?/s);
  assert.equal(db.calls[0].values[1], "student-1");
  assert.equal(db.calls[0].values[2].toISOString(), new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS).toISOString());
  assert.equal(DEFAULT_LIMIT, 10);
});

test("AI quota rejects a request when PostgreSQL admits no row", async () => {
  const db = fakePrisma([]);
  assert.equal(await consumeAiQuota(db, "student-1", new Date("2026-10-30T12:07:00.000Z")), false);
});

test("AI quota propagates database failures instead of bypassing the limit", async () => {
  const db = fakePrisma([]);
  db.$queryRaw = async () => { throw new Error("database unavailable"); };
  await assert.rejects(() => consumeAiQuota(db, "student-1"), /database unavailable/);
});
