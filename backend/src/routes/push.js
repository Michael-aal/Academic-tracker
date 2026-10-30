const express = require("express");
const crypto = require("node:crypto");
const { requireAuth } = require("../middleware/auth");
const { prisma } = require("../prisma");

const router = express.Router();
router.use(requireAuth);
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

router.get("/public-key", (_req, res) => {
  if (!configured()) return res.status(503).json({ error: "Push notifications are not configured on the server yet." });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post("/subscribe", async (req, res, next) => {
  const subscription = req.body?.subscription;
  if (!subscription || typeof subscription.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") ||
      typeof subscription.keys?.p256dh !== "string" || typeof subscription.keys?.auth !== "string" ||
      subscription.endpoint.length > 2000 || subscription.keys.p256dh.length > 200 ||
      subscription.keys.auth.length > 200) {
    return res.status(400).json({ error: "A valid browser push subscription is required." });
  }
  const recordId = "push-" + crypto.createHash("sha256").update(subscription.endpoint).digest("hex");
  try {
    await prisma.userDataRecord.upsert({
      where: { userId_kind_recordId: { userId: req.userId, kind: "push-subscriptions", recordId } },
      create: { userId: req.userId, kind: "push-subscriptions", recordId, data: subscription },
      update: { data: subscription }
    });
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

router.delete("/subscribe", async (req, res, next) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 2000) {
    return res.status(400).json({ error: "A valid subscription endpoint is required." });
  }
  const recordId = "push-" + crypto.createHash("sha256").update(endpoint).digest("hex");
  try {
    await prisma.userDataRecord.deleteMany({ where: { userId: req.userId, kind: "push-subscriptions", recordId } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
