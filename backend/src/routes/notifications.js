"use strict";
const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");
const { prisma } = require("../prisma");

const router = express.Router();
const CATEGORIES = new Set(["ANNOUNCEMENT", "UPDATE", "MAINTENANCE", "PAYMENT", "SUBSCRIPTION", "AI_CREDITS"]);

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 40;
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
    const where = { userId: req.userId };
    if (req.query.unread === "true") where.readAt = null;
    if (before && !Number.isNaN(before.getTime())) where.createdAt = { lt: before };
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
      prisma.notification.count({ where: { userId: req.userId, readAt: null } })
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) { next(error); }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.userId, readAt: null },
      data: { readAt: new Date() }
    });
    if (!result.count) {
      const existing = await prisma.notification.findFirst({ where: { id, userId: req.userId }, select: { id: true, readAt: true } });
      if (!existing) return res.status(404).json({ error: "Notification not found." });
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post("/read-all", async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.userId, readAt: null },
      data: { readAt: new Date() }
    });
    res.json({ ok: true, markedRead: result.count });
  } catch (error) { next(error); }
});

// Only the existing server-verified ADMIN role can publish announcements.
router.post("/admin/send", requireAdmin, async (req, res, next) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const category = typeof req.body?.category === "string" ? req.body.category.toUpperCase() : "ANNOUNCEMENT";
    const audience = req.body?.audience === "SELECTED" ? "SELECTED" : "ALL";
    const userIds = Array.isArray(req.body?.userIds) ? [...new Set(req.body.userIds.filter(id => typeof id === "string" && id.length > 0))].slice(0, 100) : [];

    if (title.length < 3 || title.length > 120) return res.status(400).json({ error: "Title must be between 3 and 120 characters." });
    if (body.length < 3 || body.length > 4000) return res.status(400).json({ error: "Message must be between 3 and 4,000 characters." });
    if (!CATEGORIES.has(category) || ["PAYMENT", "SUBSCRIPTION", "AI_CREDITS"].includes(category)) {
      return res.status(400).json({ error: "Choose an announcement, update, or maintenance category." });
    }
    if (audience === "SELECTED" && !userIds.length) return res.status(400).json({ error: "Select at least one recipient." });

    const recipients = await prisma.user.findMany({
      where: audience === "ALL" ? { role: { not: "ADMIN" } } : { id: { in: userIds }, role: { not: "ADMIN" } },
      select: { id: true }
    });
    if (audience === "SELECTED" && recipients.length !== userIds.length) {
      return res.status(400).json({ error: "One or more selected recipients are invalid." });
    }
    if (!recipients.length) return res.status(400).json({ error: "There are no eligible recipients for this announcement." });

    const result = await prisma.notification.createMany({
      data: recipients.map(user => ({
        userId: user.id,
        createdById: req.userId,
        title,
        body,
        category,
        metadata: { audience }
      }))
    });
    res.status(201).json({ ok: true, sent: result.count, audience });
  } catch (error) { next(error); }
});

module.exports = router;
