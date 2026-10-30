const crypto = require("node:crypto");
const { prisma } = require("./prisma");

const FREE_LIMIT = 5;
const PRO_TOOL_LIMITS = Object.freeze({ tutor: 20, quiz: 20, summarize: 20, "study-plan": 20, flashcards: 20 });
const PLAN_WINDOWS = Object.freeze({
  "trial-7-day": { days: 7, limit: 100 },
  daily: { days: 1, limit: 20 },
  weekly: { days: 7, limit: 100 },
  monthly: { days: 30, limit: 600 },
  yearly: { days: 365, limit: 2000 }
});
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function usageWindow(planCode, now = new Date()) {
  const window = PLAN_WINDOWS[String(planCode || "").toLowerCase()] || PLAN_WINDOWS.monthly;
  const start = new Date(now.getTime() - (window.days - 1) * DAY_MS);
  return { start: utcDayStart(start), end: utcDayStart(now), limit: window.limit, days: window.days };
}
async function getEntitlement(userId, now = new Date()) {
  const sub = await prisma.userSubscription.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  const active = Boolean(sub && (
    (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt > now) ||
    (sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now)
  ));
  return { isPro: active, plan: active ? "PRO" : "FREE", planCode: active ? sub.planCode : "free", status: active ? sub.status : "FREE", subscription: sub };
}
async function reserveAiUsage(userId, action) {
  const now = new Date();
  const entitlement = await getEntitlement(userId, now);
  const usageDate = utcDayStart(now);
  const window = usageWindow(entitlement.planCode, now);
  const proToolLimit = window.limit;
  const lockKey = entitlement.isPro ? action : "free-all";
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${lockKey}))`;
    const rows = await tx.aiUsageDaily.findMany({
      where: { userId, usageDate: entitlement.isPro ? { gte: window.start, lte: window.end } : { gte: new Date(usageDate.getTime() - 2 * DAY_MS), lte: usageDate } },
      select: { total: true, toolCounts: true }
    });
    const used = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const toolUsed = rows.reduce((sum, row) => sum + Number((row.toolCounts || {})[action] || 0), 0);
    const totalLimit = entitlement.isPro ? null : FREE_LIMIT;
    const toolLimit = entitlement.isPro ? proToolLimit : FREE_LIMIT;
    if ((!entitlement.isPro && used >= FREE_LIMIT) || (entitlement.isPro && toolUsed >= toolLimit)) {
      return { allowed: false, reason: !entitlement.isPro ? "FREE_3_DAY_LIMIT" : "TOOL_PERIOD_LIMIT", isPro: entitlement.isPro, used, limit: totalLimit || toolLimit, toolUsed, toolLimit, planCode: entitlement.planCode, windowDays: entitlement.isPro ? window.days : 3 };
    }
    const id = "usage_" + crypto.randomUUID();
    const updated = await tx.$queryRaw`
      INSERT INTO "ai_usage_daily" ("id", "user_id", "usage_date", "total", "tool_counts", "created_at", "updated_at")
      VALUES (${id}, ${userId}, ${usageDate}, 1, jsonb_build_object(${action}, 1), NOW(), NOW())
      ON CONFLICT ("user_id", "usage_date")
      DO UPDATE SET
        "total" = "ai_usage_daily"."total" + 1,
        "tool_counts" = jsonb_set("ai_usage_daily"."tool_counts", ARRAY[${action}],
          to_jsonb(COALESCE(("ai_usage_daily"."tool_counts" ->> ${action})::integer, 0) + 1), true),
        "updated_at" = NOW()
      RETURNING "total", "tool_counts"
    `;
    return { allowed: true, isPro: entitlement.isPro, usageDate, action, used: used + 1, limit: totalLimit, toolUsed: toolUsed + 1, toolLimit, planCode: entitlement.planCode, windowDays: entitlement.isPro ? window.days : 3, toolCounts: updated[0].tool_counts };
  });
  return result;
}
async function releaseAiUsage(userId, reservation) {
  if (!reservation?.allowed || !reservation.usageDate || !reservation.action) return;
  const { usageDate, action } = reservation;
  await prisma.$executeRaw`
    UPDATE "ai_usage_daily"
    SET "total" = GREATEST("total" - 1, 0),
        "tool_counts" = CASE
          WHEN COALESCE(("tool_counts" ->> ${action})::integer, 0) <= 1 THEN "tool_counts" - ${action}
          ELSE jsonb_set("tool_counts", ARRAY[${action}], to_jsonb(("tool_counts" ->> ${action})::integer - 1), true)
        END,
        "updated_at" = NOW()
    WHERE "user_id" = ${userId} AND "usage_date" = ${usageDate}
  `;
}
module.exports = { reserveAiUsage, releaseAiUsage, getEntitlement, utcDayStart, FREE_LIMIT, FREE_DAILY_LIMIT: FREE_LIMIT, PRO_TOOL_LIMITS, PLAN_WINDOWS };
