const express = require("express");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();
router.use(requireAuth);

function cleanBody(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadConversation(conversationId, req, res) {
  const isAdmin = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } })
    .then((user) => user?.role === "ADMIN");
  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, role: true } } }
      }
    }
  });
  if (!conversation || (!isAdmin && conversation.userId !== req.userId)) {
    res.status(404).json({ error: "Conversation not found." });
    return null;
  }
  await prisma.supportMessage.updateMany({
    where: { conversationId, senderId: { not: req.userId }, readAt: null },
    data: { readAt: new Date() }
  });
  return { ...conversation, messages: conversation.messages.map((message) => ({
    id: message.id, body: message.body, senderId: message.senderId,
    sender: message.sender, createdAt: message.createdAt,
    readAt: message.readAt
  })) };
}

router.get("/conversation", async (req, res, next) => {
  try {
    const conversation = await prisma.supportConversation.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId },
      update: {},
      select: { id: true }
    });
    const result = await loadConversation(conversation.id, req, res);
    if (result) res.json({ conversation: result });
  } catch (error) { next(error); }
});

router.get("/conversations/:id", async (req, res, next) => {
  try {
    const conversation = await loadConversation(req.params.id, req, res);
    if (conversation) res.json({ conversation });
  } catch (error) { next(error); }
});

router.post("/conversations", requireAdmin, async (req, res, next) => {
  try {
    const userId = cleanBody(req.body?.userId);
    if (!userId || userId === req.userId) return res.status(400).json({ error: "Choose a valid user to message." });
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target || target.role === "ADMIN") return res.status(404).json({ error: "User not found." });
    const conversation = await prisma.supportConversation.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true }
    });
    res.status(200).json({ conversationId: conversation.id });
  } catch (error) { next(error); }
});

router.post("/conversations/:id/messages", async (req, res, next) => {
  try {
    const body = cleanBody(req.body?.body);
    if (!body) return res.status(400).json({ error: "Write a message before sending." });
    if (body.length > 4000) return res.status(400).json({ error: "Messages must be 4,000 characters or fewer." });
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
    const isAdmin = user?.role === "ADMIN";
    const conversation = await prisma.supportConversation.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true, status: true } });
    if (!conversation || (!isAdmin && conversation.userId !== req.userId)) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    const message = await prisma.supportMessage.create({
      data: { conversationId: conversation.id, senderId: req.userId, body },
      select: { id: true, body: true, senderId: true, createdAt: true }
    });
    const updateData = isAdmin && conversation.status === "RESOLVED" ? { status: "OPEN" } : {};
    await prisma.supportConversation.update({ where: { id: conversation.id }, data: updateData });
    res.status(201).json({ message });
  } catch (error) { next(error); }
});

router.patch("/conversations/:id/status", requireAdmin, async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!["OPEN", "IN_PROGRESS", "RESOLVED"].includes(status)) {
      return res.status(400).json({ error: "Choose Open, In progress, or Resolved." });
    }
    const result = await prisma.supportConversation.updateMany({
      where: { id: req.params.id },
      data: { status }
    });
    if (!result.count) return res.status(404).json({ error: "Conversation not found." });
    res.json({ ok: true, status });
  } catch (error) { next(error); }
});

module.exports = router;
