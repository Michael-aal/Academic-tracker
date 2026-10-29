const express = require("express");
const crypto = require("node:crypto");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function initializeCheckout(userId, email, pack) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error("Payments are not configured yet."), { status: 503 });
  if (pack.priceUsdCents < 200) throw Object.assign(new Error("This study pack is below Paystack's documented $2.00 USD minimum."), { status: 400 });
  const reference = "pack_" + crypto.randomUUID().replace(/-/g, "");
  const existing = await prisma.studyPackPurchase.findUnique({ where: { userId_packId: { userId, packId: pack.id } } });
  if (existing?.status === "PAID") throw Object.assign(new Error("You already own this study pack."), { status: 409 });
  if (existing?.status === "PENDING") throw Object.assign(new Error("A payment for this pack is already pending. Wait for confirmation before trying again."), { status: 409 });
  const purchase = existing
    ? await prisma.studyPackPurchase.update({ where: { id: existing.id }, data: { paymentReference: reference, status: "PENDING", amountMinor: pack.priceUsdCents, currency: "USD", paidAt: null } })
    : await prisma.studyPackPurchase.create({ data: { userId, packId: pack.id, paymentReference: reference, status: "PENDING", amountMinor: pack.priceUsdCents, currency: "USD" } });
  await prisma.paymentTransaction.create({ data: { userId, reference, provider: "paystack", planCode: "pack:" + pack.slug, amountMinor: pack.priceUsdCents, currency: "USD", status: "PENDING", metadata: { purchaseType: "study-pack", packId: pack.id, purchaseId: purchase.id } } });
  try {
    const origin = (process.env.FRONTEND_ORIGIN || "https://academic-tracker-nu.vercel.app").split(",")[0].trim().replace(/\/$/, "");
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, amount: pack.priceUsdCents, currency: "USD", reference, callback_url: origin + "/study-packs.html?payment=return", metadata: { userId, purchaseType: "study-pack", packId: pack.id, purchaseId: purchase.id } })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== true || !result.data?.authorization_url) throw Object.assign(new Error(result.message || "Could not initialize payment."), { status: response.status >= 500 ? 502 : 400 });
    await prisma.paymentTransaction.update({ where: { reference }, data: { checkoutUrl: result.data.authorization_url } });
    return { authorizationUrl: result.data.authorization_url, reference };
  } catch (error) {
    await prisma.paymentTransaction.update({ where: { reference }, data: { status: "FAILED" } }).catch(() => {});
    await prisma.studyPackPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } }).catch(() => {});
    throw error;
  }
}

router.get("/", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { educationTrack: true } });
    const packs = await prisma.studyPack.findMany({
      where: { published: true, educationTrack: { in: ["BOTH", user?.educationTrack || "SECONDARY"] } },
      select: { id: true, slug: true, title: true, description: true, educationTrack: true, priceUsdCents: true },
      orderBy: { priceUsdCents: "asc" }
    });
    const purchases = await prisma.studyPackPurchase.findMany({ where: { userId: req.userId }, select: { packId: true, status: true } });
    const purchaseByPack = new Map(purchases.map(item => [item.packId, item.status]));
    res.json({ currency: "USD", packs: packs.map(pack => ({ ...pack, priceUsd: (pack.priceUsdCents / 100).toFixed(2), purchaseStatus: purchaseByPack.get(pack.id) || null, checkoutAvailable: Boolean(process.env.PAYSTACK_SECRET_KEY) && pack.priceUsdCents >= 200 })) });
  } catch (error) { next(error); }
});

router.get("/purchases", async (req, res, next) => {
  try {
    const purchases = await prisma.studyPackPurchase.findMany({
      where: { userId: req.userId, status: "PAID" },
      include: { pack: { select: { slug: true, title: true, description: true, content: true, educationTrack: true } } },
      orderBy: { paidAt: "desc" }
    });
    res.json({ purchases });
  } catch (error) { next(error); }
});

router.post("/:slug/checkout", async (req, res, next) => {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const [user, pack, existing] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } }),
      prisma.studyPack.findFirst({ where: { slug, published: true } }),
      prisma.studyPack.findFirst({ where: { slug, published: true }, select: { id: true } }).then(found => found ? prisma.studyPackPurchase.findUnique({ where: { userId_packId: { userId: req.userId, packId: found.id } } }) : null)
    ]);
    if (!user) return res.status(401).json({ error: "Account not found." });
    if (!pack) return res.status(404).json({ error: "Study pack not found." });
    if (existing?.status === "PAID") return res.status(409).json({ error: "You already own this study pack." });
    const checkout = await initializeCheckout(req.userId, user.email, pack);
    return res.status(201).json(checkout);
  } catch (error) { next(error); }
});

module.exports = router;
