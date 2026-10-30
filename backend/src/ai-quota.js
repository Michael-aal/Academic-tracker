const { randomUUID } = require("node:crypto");

const WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 10;
const RETENTION_MS = 48 * 60 * 60 * 1000;
let lastCleanupAt = 0;

/**
 * Atomically consumes one AI request from a rolling 15-minute account window.
 * Locking the account row serializes concurrent requests across API instances;
 * the count and insert happen in the same PostgreSQL transaction.
 */
async function consumeAiQuota(prisma, userId, now = new Date(), limit = DEFAULT_LIMIT) {
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  const allowed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const recentCount = await tx.aiUsageEvent.count({
      where: { userId, createdAt: { gt: cutoff } }
    });
    if (recentCount >= limit) return false;
    await tx.aiUsageEvent.create({ data: { id: randomUUID(), userId, createdAt: now } });
    return true;
  });

  // Keep the audit/quota table bounded without adding a scheduler dependency.
  if (now.getTime() - lastCleanupAt > 60 * 60 * 1000) {
    lastCleanupAt = now.getTime();
    prisma.aiUsageEvent.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } }
    }).catch(() => { lastCleanupAt = 0; });
  }
  return allowed;
}

module.exports = { consumeAiQuota, WINDOW_MS, DEFAULT_LIMIT };
