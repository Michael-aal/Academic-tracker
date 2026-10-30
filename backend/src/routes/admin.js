const express = require("express");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, createdAt: true,
        supportConversation: {
          select: {
            id: true, status: true, updatedAt: true,
            messages: { orderBy: { createdAt: "desc" }, take: 1,
              select: { body: true, senderId: true, createdAt: true } }
          }
        }
      }
    });
    const mapped = await Promise.all(users.map(async (user) => {
      const conversation = user.supportConversation;
      const lastMessage = conversation?.messages?.[0] || null;
      const unreadCount = conversation
        ? await prisma.supportMessage.count({
            where: { conversationId: conversation.id, senderId: user.id, readAt: null }
          })
        : 0;
      return {
        id: user.id, name: user.name, email: user.email, createdAt: user.createdAt,
        conversationId: conversation?.id || null,
        status: conversation?.status || "NO CONVERSATION",
        updatedAt: conversation?.updatedAt || null,
        lastMessage: lastMessage ? { body: lastMessage.body, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt } : null,
        unreadCount
      };
    }));
    res.json({ users: mapped });
  } catch (error) { next(error); }
});


router.get("/monitoring", async (_req, res, next) => {
  const startedAt = Date.now();
  try {
    const now = new Date();
    const utcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [dbCheck, users, admins, subjects, scores, courses, quizAttempts, supportConversations, openSupport, subscriptions, activeTrials, activePaid, payments, successfulPayments, pendingPayments, failedPayments, aiUsage, institutionLeads, publishedPacks, pendingPurchases] = await Promise.all([
      prisma.$queryRaw`SELECT 1 AS ok`,
      prisma.user.count(),
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.subject.count(),
      prisma.assessmentScore.count(),
      prisma.universityCourse.count(),
      prisma.aiQuizAttempt.count(),
      prisma.supportConversation.count(),
      prisma.supportConversation.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.userSubscription.count(),
      prisma.userSubscription.count({ where: { status: "TRIALING", trialEndsAt: { gt: now } } }),
      prisma.userSubscription.count({ where: { status: "ACTIVE", currentPeriodEnd: { gt: now } } }),
      prisma.paymentTransaction.count(),
      prisma.paymentTransaction.count({ where: { status: "SUCCESS" } }),
      prisma.paymentTransaction.count({ where: { status: "PENDING" } }),
      prisma.paymentTransaction.count({ where: { status: "FAILED" } }),
      prisma.aiUsageDaily.aggregate({ where: { usageDate: utcDay }, _sum: { total: true }, _count: { _all: true } }),
      prisma.institutionLicense.count(),
      prisma.studyPack.count({ where: { published: true } }),
      prisma.studyPackPurchase.count({ where: { status: "PENDING" } })
    ]);
    const [recentPayments, recentUsers, recentLeads, usageByTool] = await Promise.all([
      prisma.paymentTransaction.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { id: true, reference: true, planCode: true, amountMinor: true, currency: true, status: true, createdAt: true, paidAt: true, user: { select: { name: true, email: true } } } }),
      prisma.user.findMany({ take: 6, orderBy: { createdAt: "desc" }, select: { id: true, name: true, educationTrack: true, createdAt: true } }),
      prisma.institutionLicense.findMany({ take: 5, orderBy: { createdAt: "desc" }, select: { id: true, institutionName: true, seatCount: true, status: true, createdAt: true } }),
      prisma.aiUsageDaily.findMany({ where: { usageDate: utcDay }, select: { toolCounts: true } })
    ]);
    const tools = {};
    for (const row of usageByTool) {
      if (!row.toolCounts || typeof row.toolCounts !== "object" || Array.isArray(row.toolCounts)) continue;
      for (const [name, count] of Object.entries(row.toolCounts)) {
        if (typeof count === "number" && Number.isFinite(count)) tools[name] = (tools[name] || 0) + count;
      }
    }
    res.set("Cache-Control", "no-store");
    res.json({
      generatedAt: now.toISOString(),
      api: { status: "operational", uptimeSeconds: Math.floor(process.uptime()), nodeVersion: process.version, environment: process.env.NODE_ENV || "unknown", memory: process.memoryUsage(), responseTimeMs: Date.now() - startedAt },
      database: { status: dbCheck.length ? "connected" : "unknown" },
      metrics: {
        users, admins, subjects, scores, courses, quizAttempts, supportConversations, openSupport,
        subscriptions, activeTrials, activePaid, payments, successfulPayments, pendingPayments, failedPayments,
        aiRequestsToday: aiUsage._sum.total || 0, activeUsersForAiToday: aiUsage._count._all,
        institutionLeads, publishedPacks, pendingPurchases, aiUsageByTool: tools
      },
      recentPayments, recentUsers, recentLeads
    });
  } catch (error) { next(error); }
});

module.exports = router;
