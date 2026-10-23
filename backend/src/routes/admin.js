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

module.exports = router;
