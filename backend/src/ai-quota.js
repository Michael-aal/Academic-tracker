const { randomUUID } = require("node:crypto");

const WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 10;
const RETENTION_MS = 48 * 60 * 60 * 1000;
let lastCleanupAt = 0;

/**
 * Atomically consumes one AI request from a fixed 15-minute account window.
 * The conditional upsert is enforced by PostgreSQL, so concurrent API instances
 * cannot each admit requests against stale in-memory counters.
 */
async function consumeAiQuota(prisma, userId, now = new Date(), limit = DEFAULT_LIMIT) {
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  const rows = await prisma.$queryRaw`
    INSERT INTO "ai_usage_windows" ("id", "user_id", "window_start", "request_count")
    VALUES (${randomUUID()}, ${userId}, ${windowStart}, 1)
    ON CONFLICT ("user_id", "window_start")
    DO UPDATE SET "request_count" = "ai_usage_windows"."request_count" + 1
    WHERE "ai_usage_windows"."request_count" < ${limit}
    RETURNING "request_count"
  `;
  const allowed = rows.length > 0;
  // Keep the quota table bounded without adding a scheduler dependency.
  if (now.getTime() - lastCleanupAt > 60 * 60 * 1000) {
    lastCleanupAt = now.getTime();
    prisma.aiUsageWindow.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - RETENTION_MS) } }
    }).catch(() => { lastCleanupAt = 0; });
  }
  return allowed;
}

module.exports = { consumeAiQuota, WINDOW_MS, DEFAULT_LIMIT };
