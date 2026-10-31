const express = require("express");
const crypto = require("node:crypto");
const { requireAuth } = require("../middleware/auth");
const { prisma } = require("../prisma");

const router = express.Router();
const NGN = "NGN";
const DAY = 24 * 60 * 60 * 1000;

function catalog() {
  let config = {};
  try { config = JSON.parse(process.env.PREMIUM_CATALOG_JSON || "{}"); } catch { throw new Error("PREMIUM_CATALOG_JSON must be valid JSON."); }
  const plans = config.plans && typeof config.plans === "object" ? config.plans : {};
  const bundles = config.bundles && typeof config.bundles === "object" ? config.bundles : {};
  return { currency: NGN, plans, bundles };
}
function safeCatalog() {
  const { plans, bundles } = catalog();
  const clean = source => Object.entries(source).map(([key, item]) => ({
    key, name: String(item.name || key), amountKobo: Number(item.amountKobo),
    durationDays: Number(item.durationDays || 0), credits: Number(item.credits || 0),
    creditValidityDays: Number(item.creditValidityDays || 30), description: String(item.description || "")
  })).filter(x => Number.isSafeInteger(x.amountKobo) && x.amountKobo >= 10000 && Number.isSafeInteger(x.credits) && x.credits >= 0 && x.credits <= 1000000 && Number.isInteger(x.creditValidityDays) && x.creditValidityDays >= 1 && x.creditValidityDays <= 365 && (x.durationDays === 0 || (Number.isInteger(x.durationDays) && x.durationDays >= 1 && x.durationDays <= 365)));
  return { currency: NGN, plans: clean(plans).filter(item => item.durationDays >= 1), bundles: clean(bundles) };
}
function makeReference() { return "AT-" + crypto.randomBytes(16).toString("hex"); }
function paystackSecret() { return process.env.PAYSTACK_SECRET_KEY || ""; }
function safeEqual(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function verifyWithPaystack(reference) {
  if (!paystackSecret()) throw new Error("Payments are not configured yet.");
  const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + paystackSecret() }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.status || data.data?.status !== "success") throw new Error("Payment has not been confirmed by Paystack.");
  return data.data;
}

async function grantPaidTransaction(reference, verified) {
  return prisma.$transaction(async tx => {
    // Serialize webhook and browser verification for this reference before reading status.
    await tx.$queryRaw`SELECT "id" FROM "payment_transactions" WHERE "reference" = ${reference} FOR UPDATE`;
    const payment = await tx.paymentTransaction.findUnique({ where: { reference } });
    if (!payment) return { status: 404, error: "Payment reference was not found." };
    if (payment.status === "PAID") return { status: 200, alreadyProcessed: true };
    if (verified.currency !== NGN || verified.amount !== payment.amountKobo || verified.reference !== reference) {
      await tx.paymentTransaction.update({ where: { reference }, data: { status: "REJECTED" } });
      return { status: 400, error: "The verified payment does not match this purchase." };
    }
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${payment.userId} FOR UPDATE`;
    const now = new Date();
    if (payment.type === "PLAN") {
      const existing = await tx.premiumAccess.findUnique({ where: { userId: payment.userId } });
      const startsAt = existing && existing.expiresAt > now ? existing.expiresAt : now;
      const days = Number(payment.durationDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) return { status: 400, error: "Invalid plan duration." };
      const expiresAt = new Date(startsAt.getTime() + days * DAY);
      await tx.premiumAccess.upsert({
        where: { userId: payment.userId },
        create: { userId: payment.userId, planKey: payment.itemKey, startsAt, expiresAt },
        update: { planKey: payment.itemKey, startsAt, expiresAt }
      });
      if (payment.credits > 0) {
        await tx.creditWallet.upsert({ where: { userId: payment.userId }, create: { userId: payment.userId, balance: payment.credits }, update: { balance: { increment: payment.credits } } });
        await tx.creditLot.create({ data: { userId: payment.userId, originalCredits: payment.credits, remainingCredits: payment.credits, expiresAt: new Date(now.getTime() + (payment.creditValidityDays || 30) * DAY) } });
        await tx.creditLedger.create({ data: { userId: payment.userId, delta: payment.credits, kind: "PLAN_GRANT", reference: "paystack:" + reference, description: "Credits included with " + payment.itemKey } });
      }
    } else {
      await tx.creditWallet.upsert({ where: { userId: payment.userId }, create: { userId: payment.userId, balance: payment.credits }, update: { balance: { increment: payment.credits } } });
      await tx.creditLot.create({ data: { userId: payment.userId, originalCredits: payment.credits, remainingCredits: payment.credits, expiresAt: new Date(now.getTime() + (payment.creditValidityDays || 30) * DAY) } });
      await tx.creditLedger.create({ data: { userId: payment.userId, delta: payment.credits, kind: "PURCHASE", reference: "paystack:" + reference, description: payment.itemKey + " credit bundle" } });
    }
    const dateLabel = value => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(value);
    const amountLabel = new Intl.NumberFormat("en-NG", { style: "currency", currency: NGN, maximumFractionDigits: 2 }).format(payment.amountKobo / 100);
    const currentPlan = payment.type === "PLAN" ? payment.itemKey.charAt(0).toUpperCase() + payment.itemKey.slice(1) + " Premium" : "Free";
    const paymentTitle = payment.type === "PLAN" ? "Your Premium payment is confirmed" : "Your AI credits have been added";
    const paymentBody = payment.type === "PLAN"
      ? "We received " + amountLabel + ". Your " + payment.durationDays + "-day " + payment.itemKey + " Premium plan is active from " + dateLabel(now) + " until " + dateLabel(new Date((await tx.premiumAccess.findUnique({ where: { userId: payment.userId } })).expiresAt)) + ". " + payment.credits + " AI credits have been added. Payment reference: " + reference + "."
      : "We received " + amountLabel + ". " + payment.credits + " AI credits have been added to your wallet. Your current plan remains " + currentPlan + ". Credits expire on " + dateLabel(new Date(now.getTime() + (payment.creditValidityDays || 30) * DAY)) + ". Payment reference: " + reference + ".";
    await tx.notification.create({
      data: {
        userId: payment.userId,
        title: paymentTitle,
        body: paymentBody,
        category: payment.type === "PLAN" ? "SUBSCRIPTION" : "AI_CREDITS",
        metadata: { paymentReference: reference, amountKobo: payment.amountKobo, credits: payment.credits, durationDays: payment.durationDays, paymentType: payment.type, confirmedAt: now.toISOString() }
      }
    });
    await tx.paymentTransaction.update({ where: { reference }, data: { status: "PAID", paidAt: now } });
    return { status: 200, alreadyProcessed: false };
  }, { isolationLevel: "Serializable" });
}

router.get("/catalog", (_req, res) => {
  try {
    const data = safeCatalog();
    res.json({ ...data, paymentsConfigured: Boolean(paystackSecret()), configured: data.plans.length > 0 || data.bundles.length > 0 });
  } catch { res.status(503).json({ error: "Premium packages are temporarily unavailable." }); }
});

router.post("/webhook", async (req, res) => {
  const signature = req.get("x-paystack-signature") || "";
  const expected = crypto.createHmac("sha512", paystackSecret()).update(req.rawBody || Buffer.from(JSON.stringify(req.body || {}))).digest("hex");
  if (!paystackSecret() || !safeEqual(signature, expected)) return res.sendStatus(401);
  if (req.body?.event !== "charge.success" || !req.body?.data?.reference) return res.sendStatus(200);
  try {
    const verified = await verifyWithPaystack(req.body.data.reference);
    await grantPaidTransaction(req.body.data.reference, verified);
    return res.sendStatus(200);
  } catch { return res.sendStatus(500); }
});

router.use(requireAuth);
router.get("/me", async (req, res, next) => {
  try {
    const now = new Date();
    const [access, wallet, lots, transactions] = await Promise.all([
      prisma.premiumAccess.findUnique({ where: { userId: req.userId } }),
      prisma.creditWallet.findUnique({ where: { userId: req.userId } }),
      prisma.creditLot.findMany({ where: { userId: req.userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } }, orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }], select: { remainingCredits: true, expiresAt: true } }),
      prisma.paymentTransaction.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 12, select: { reference: true, type: true, itemKey: true, amountKobo: true, status: true, createdAt: true, paidAt: true } })
    ]);
    const validCredits = lots.reduce((sum, lot) => sum + lot.remainingCredits, 0);
    res.json({
      plan: access && access.expiresAt > now ? { name: "Premium", key: access.planKey, startsAt: access.startsAt, expiresAt: access.expiresAt, active: true } : { name: "Free", active: false },
      credits: { balance: validCredits, lots },
      aiAvailable: validCredits > 0,
      transactions
    });
  } catch (error) { next(error); }
});

router.post("/initialize", async (req, res, next) => {
  try {
    if (!paystackSecret()) return res.status(503).json({ error: "Payments are not configured yet. Please contact support." });
    const type = req.body?.type === "PLAN" ? "PLAN" : req.body?.type === "BUNDLE" ? "BUNDLE" : "";
    const key = typeof req.body?.key === "string" ? req.body.key : "";
    const days = type === "PLAN" && key === "daily" ? Number(req.body?.days || 1) : null;
    if (!type || !key || (days !== null && (!Number.isInteger(days) || days < 1 || days > 3))) return res.status(400).json({ error: "Choose a valid package." });
    const { plans, bundles } = safeCatalog();
    const item = (type === "PLAN" ? plans : bundles).find(x => x.key === key);
    if (!item) return res.status(400).json({ error: "That package is not available." });
    const amountKobo = type === "PLAN" && key === "daily" ? item.amountKobo * days : item.amountKobo;
    const credits = type === "PLAN" && key === "daily" ? item.credits * days : item.credits;
    if (!Number.isSafeInteger(amountKobo) || amountKobo < 10000 || !Number.isSafeInteger(credits) || credits < 0) return res.status(400).json({ error: "Package configuration is invalid." });
    const reference = makeReference();
    const payment = await prisma.paymentTransaction.create({ data: { userId: req.userId, reference, type, itemKey: key, amountKobo, credits, durationDays: type === "PLAN" ? (days || item.durationDays) : 0, creditValidityDays: item.creditValidityDays } });
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: "Bearer " + paystackSecret(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: (await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } })).email, amount: amountKobo, currency: NGN, reference, callback_url: (process.env.PAYSTACK_CALLBACK_URL || "https://study-track-lilac.vercel.app/premium.html"), metadata: { userId: req.userId, type, key, durationDays: days || item.durationDays || 0 } })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.status || !data.data?.authorization_url) {
      await prisma.paymentTransaction.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      return res.status(502).json({ error: "Paystack could not initialize this payment. Please try again." });
    }
    res.status(201).json({ authorizationUrl: data.data.authorization_url, reference });
  } catch (error) { next(error); }
});

router.post("/verify", async (req, res, next) => {
  try {
    const reference = typeof req.body?.reference === "string" ? req.body.reference : "";
    if (!/^AT-[a-f0-9]{32}$/.test(reference)) return res.status(400).json({ error: "Invalid payment reference." });
    const payment = await prisma.paymentTransaction.findFirst({ where: { reference, userId: req.userId } });
    if (!payment) return res.status(404).json({ error: "Payment reference not found." });
    const verified = await verifyWithPaystack(reference);
    const result = await grantPaidTransaction(reference, verified);
    res.status(result.status).json(result.error ? { error: result.error } : { ok: true, alreadyProcessed: result.alreadyProcessed });
  } catch (error) { res.status(400).json({ error: error.message || "Payment verification failed." }); }
});



module.exports = router;
