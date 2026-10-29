const crypto = require("node:crypto");
const { prisma } = require("./prisma");

const FREE_DAILY_LIMIT = 5;
const PRO_TOOL_LIMITS = Object.freeze({ tutor: 100, quiz: 20, summarize: 20, "study-plan": 20, flashcards: 20 });
const PRO_DAILY_LIMIT = Object.values(PRO_TOOL_LIMITS).reduce((sum, value) => sum + value, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
async function getEntitlement(userId, now = new Date()) {
  const sub = await prisma.userSubscription.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  const isPro = Boolean(sub && (
    (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt > now) ||
    (sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now)
  ));
  return { isPro, plan: isPro ? "PRO" : "FREE", status: isPro ? sub.status : "FREE", subscription: sub };
}
async function reserveAiUsage(userId, action) {
  const entitlement = await getEntitlement(userId);
  const usageDate = utcDayStart();
  const totalLimit = entitlement.isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const toolLimit = entitlement.isPro ? (PRO_TOOL_LIMITS[action] || 0) : FREE_DAILY_LIMIT;
  const id = "usage_" + crypto.randomUUID();
  const rows = await prisma.$queryRaw`
    INSERT INTO "ai_usage_daily" ("id", "user_id", "usage_date", "total", "tool_counts", "created_at", "updated_at")
    VALUES (${id}, ${userId}, ${usageDate}, 1, jsonb_build_object(${action}, 1), NOW(), NOW())
    ON CONFLICT ("user_id", "usage_date")
    DO UPDATE SET
      "total" = "ai_usage_daily"."total" + 1,
      "tool_counts" = jsonb_set(
        "ai_usage_daily"."tool_counts",
        ARRAY[${action}],
        to_jsonb(COALESCE(("ai_usage_daily"."tool_counts" ->> ${action})::integer, 0) + 1),
        true
      ),
      "updated_at" = NOW()
    WHERE "ai_usage_daily"."total" < ${totalLimit}
      AND COALESCE(("ai_usage_daily"."tool_counts" ->> ${action})::integer, 0) < ${toolLimit}
    RETURNING "total", "tool_counts"
  `;
  if (!rows.length) {
    const existing = await prisma.aiUsageDaily.findUnique({ where: { userId_usageDate: { userId, usageDate } } });
    const toolCounts = existing?.toolCounts && typeof existing.toolCounts === "object" ? existing.toolCounts : {};
    const reason = existing && existing.total >= totalLimit ? "DAILY_LIMIT" : "TOOL_LIMIT";
    return { allowed: false, reason, isPro: entitlement.isPro, used: existing?.total || 0, limit: totalLimit, toolUsed: Number(toolCounts[action] || 0), toolLimit };
  }
  return { allowed: true, isPro: entitlement.isPro, usageDate, action, used: Number(rows[0].total), limit: entitlement.isPro ? null : FREE_DAILY_LIMIT, toolCounts: rows[0].tool_counts };
}
async function releaseAiUsage(userId, reservation) {
  if (!reservation?.allowed || !reservation.usageDate || !reservation.action) return;
  const { usageDate, action } = reservation;
  await prisma.$executeRaw`
    UPDATE "ai_usage_daily"
    SET "total" = GREATEST("total" - 1, 0),
        "tool_counts" = CASE
          WHEN COALESCE(("tool_counts" ->> ${action})::integer, 0) <= 1
            THEN "tool_counts" - ${action}
          ELSE jsonb_set("tool_counts", ARRAY[${action}], to_jsonb(("tool_counts" ->> ${action})::integer - 1), true)
        END,
        "updated_at" = NOW()
    WHERE "user_id" = ${userId} AND "usage_date" = ${usageDate}
  `;
}
module.exports = { reserveAiUsage, releaseAiUsage, getEntitlement, utcDayStart, FREE_DAILY_LIMIT, PRO_TOOL_LIMITS, PRO_DAILY_LIMIT };
