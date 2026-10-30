const express = require("express");
const crypto = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;
const PLAN_CONFIG = {
  daily:   { name: "Daily Pro",   interval: "daily",   amountUsdCents: 52,   days: 1,   env: "PAYSTACK_PLAN_DAILY" },
  weekly:  { name: "Weekly Pro",  interval: "weekly",  amountUsdCents: 297,  days: 7,   env: "PAYSTACK_PLAN_WEEKLY" },
  monthly: { name: "Monthly Pro", interval: "monthly", amountUsdCents: 1486, days: 30,  env: "PAYSTACK_PLAN_MONTHLY" },
  yearly:  { name: "Yearly Pro",  interval: "annually",amountUsdCents: 3714, days: 365, env: "PAYSTACK_PLAN_YEARLY" }
};
const TOOL_LIMITS_PRO = { tutor: 20, quiz: 20, summarize: 20, "study-plan": 20, flashcards: 20 };
const FREE_LIMIT = 5;
const PLAN_DAYS = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };
function encryptProviderToken(value) {
  if (!value) return null;
  const key = crypto.createHash("sha256").update(process.env.SUBSCRIPTION_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || "").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}
function decryptProviderToken(value) {
  if (!value) return null;
  const [version, ivText, tagText, encryptedText] = String(value).split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) return null;
  const key = crypto.createHash("sha256").update(process.env.SUBSCRIPTION_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || "").digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function currentSubscription(sub, now = new Date()) {
  if (!sub) return { plan: "FREE", status: "FREE", isPro: false, trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt > now) {
    return { plan: "PRO", status: "TRIALING", isPro: true, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.trialEndsAt, cancelAtPeriodEnd: false };
  }
  if (sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
    return { plan: "PRO", status: "ACTIVE", isPro: true, trialEndsAt: null, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd };
  }
  return { plan: "FREE", status: sub.status === "CANCELLED" ? "CANCELLED" : "EXPIRED", isPro: false, trialEndsAt: sub.trialEndsAt || null, currentPeriodEnd: sub.currentPeriodEnd || null, cancelAtPeriodEnd: sub.cancelAtPeriodEnd };
}
async function getCurrentSubscription(userId) {
  return prisma.userSubscription.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}
async function paystackRequest(path, options = {}) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error("Payments are not configured yet."), { status: 503 });
  const response = await fetch("https://api.paystack.co" + path, {
    ...options,
    headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status !== true) {
    const err = new Error(typeof body.message === "string" ? body.message.slice(0, 220) : "Payment provider request failed.");
    err.status = response.status >= 500 ? 502 : 400;
    throw err;
  }
  return body.data;
}
function addInterval(date, planCode) {
  const days = PLAN_CONFIG[planCode]?.days || 30;
  return new Date(date.getTime() + days * DAY);
}
function verifySignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.get("x-paystack-signature") || "";
  if (!secret || !signature || !req.rawBody) return false;
  const expected = crypto.createHmac("sha512", secret).update(req.rawBody).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function applySuccessfulPayment(reference, data, source = "verify") {
  const payment = await prisma.paymentTransaction.findUnique({ where: { reference } });
  if (!payment || payment.status === "SUCCESS") return { processed: Boolean(payment), duplicate: true };
  if (data.status !== "success") {
    if (["failed", "abandoned", "reversed"].includes(String(data.status || "").toLowerCase())) {
      await prisma.paymentTransaction.update({ where: { reference }, data: { status: "FAILED" } });
    }
    return { processed: false, pending: !["failed", "abandoned", "reversed"].includes(String(data.status || "").toLowerCase()) };
  }
  if (data.reference !== reference || Number(data.amount) !== payment.amountMinor || String(data.currency || "").toUpperCase() !== payment.currency) {
    await prisma.paymentTransaction.update({ where: { reference }, data: { status: "FAILED" } });
    return { processed: false, mismatch: true };
  }
  const paidAt = data.paid_at ? new Date(data.paid_at) : new Date();
  const metadata = payment.metadata && typeof payment.metadata === "object" ? payment.metadata : {};
  await prisma.$transaction(async tx => {
    const changed = await tx.paymentTransaction.updateMany({ where: { reference, status: "PENDING" }, data: { status: "SUCCESS", paidAt, metadata: { ...metadata, verifiedBy: source } } });
    if (!changed.count) return;
    if (metadata.purchaseType === "study-pack" && typeof metadata.packId === "string") {
      const delivered = await tx.studyPackPurchase.updateMany({ where: { paymentReference: reference, status: "PENDING" }, data: { status: "PAID", paidAt } });
      if (!delivered.count) throw new Error("Paid study pack purchase could not be matched to its payment reference.");
      return;
    }
    const planCode = payment.planCode;
    if (!PLAN_CONFIG[planCode]) return;
    const now = new Date();
    const prior = await tx.userSubscription.findFirst({ where: { userId: payment.userId }, orderBy: { createdAt: "desc" } });
    const current = currentSubscription(prior, now);
    const start = current.isPro && current.currentPeriodEnd ? current.currentPeriodEnd : now;
    const end = addInterval(start, planCode);
    await tx.userSubscription.create({ data: {
      userId: payment.userId, planCode, status: "ACTIVE", currentPeriodStart: start,
      currentPeriodEnd: end, providerCustomerCode: typeof data.customer?.customer_code === "string" ? data.customer.customer_code : undefined,
      providerSubscriptionCode: typeof data.subscription?.subscription_code === "string" ? data.subscription.subscription_code : undefined,
      providerSubscriptionToken: typeof data.subscription?.email_token === "string" ? encryptProviderToken(data.subscription.email_token) : undefined
    } });
  });
  return { processed: true };
}

// Paystack calls this without a user session. Verify the HMAC against the raw body.
router.post("/webhook", async (req, res) => {
  if (!verifySignature(req)) return res.status(401).json({ error: "Invalid payment webhook signature." });
  const event = req.body || {};
  const eventName = typeof event.event === "string" ? event.event : "";
  const data = event.data || {};
  const reference = typeof data.reference === "string" ? data.reference : "";
  if (eventName !== "charge.success" || !reference) return res.sendStatus(200);
  try {
    let paymentForEvent = await prisma.paymentTransaction.findUnique({ where: { reference } });
    if (!paymentForEvent && typeof data.subscription?.subscription_code === "string") {
      const existingSubscription = await prisma.userSubscription.findFirst({ where: { providerSubscriptionCode: data.subscription.subscription_code }, orderBy: { createdAt: "desc" } });
      const configuredPlan = existingSubscription && PLAN_CONFIG[existingSubscription.planCode];
      if (existingSubscription && configuredPlan && Number.isInteger(data.amount) &&
          data.amount === configuredPlan.amountUsdCents && String(data.currency || "").toUpperCase() === "USD") {
        try {
          paymentForEvent = await prisma.paymentTransaction.create({ data: {
            userId: existingSubscription.userId, reference, planCode: existingSubscription.planCode,
            amountMinor: configuredPlan.amountUsdCents, currency: "USD", status: "PENDING",
            metadata: { renewal: true, providerSubscriptionCode: data.subscription.subscription_code }
          } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
          paymentForEvent = await prisma.paymentTransaction.findUnique({ where: { reference } });
        }
      }
    }
    if (!paymentForEvent) return res.sendStatus(200);
    const eventId = event.id ? String(event.id) : eventName + ":" + reference;
    try {
      await prisma.webhookEvent.create({ data: { id: "wh_" + crypto.randomUUID(), provider: "paystack", eventId } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const latestPayment = await prisma.paymentTransaction.findUnique({ where: { reference } });
      if (latestPayment?.status === "SUCCESS") return res.sendStatus(200);
    }
    await applySuccessfulPayment(reference, data, "webhook");
    if (typeof data.subscription?.subscription_code === "string") {
      const latest = await prisma.userSubscription.findFirst({ where: { userId: paymentForEvent.userId, planCode: paymentForEvent.planCode }, orderBy: { createdAt: "desc" } });
      if (latest) await prisma.userSubscription.update({ where: { id: latest.id }, data: {
        providerSubscriptionCode: data.subscription.subscription_code,
        providerSubscriptionToken: typeof data.subscription.email_token === "string" ? encryptProviderToken(data.subscription.email_token) : latest.providerSubscriptionToken
      } });
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error("Payment webhook processing failed:", error.message);
    return res.status(500).json({ error: "Webhook processing failed; the provider may retry this event." });
  }
});

router.use(requireAuth);

router.get("/plans", (_req, res) => {
  const configured = Boolean(process.env.PAYSTACK_SECRET_KEY);
  res.json({ currency: "USD", freeAiRequestsPerRolling3Days: FREE_LIMIT, plans: Object.entries(PLAN_CONFIG).map(([code, plan]) => ({
    code, name: plan.name, interval: plan.interval, priceUsd: (plan.amountUsdCents / 100).toFixed(2),
    trialDays: 7, recurring: true, checkoutConfigured: configured && Boolean(process.env[plan.env]),
    checkoutAvailable: plan.amountUsdCents >= 200 && configured && Boolean(process.env[plan.env]),
    checkoutNote: plan.amountUsdCents < 200 ? "Paystack's documented USD transaction minimum is $2.00; this price must be adjusted before checkout can be enabled." : (!configured || !process.env[plan.env] ? "Payment configuration is not complete yet." : null)
  })) });
});

router.get("/me", async (req, res, next) => {
  try {
    const [sub, recentPayments] = await Promise.all([
      getCurrentSubscription(req.userId),
      prisma.paymentTransaction.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 20, select: { reference: true, planCode: true, amountMinor: true, currency: true, status: true, paidAt: true, createdAt: true } })
    ]);
    res.json({ subscription: currentSubscription(sub), payments: recentPayments });
  } catch (error) { next(error); }
});

router.get("/usage", async (req, res, next) => {
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rawSub = await getCurrentSubscription(req.userId);
    const sub = currentSubscription(rawSub, now);
    const days = sub.isPro ? (PLAN_DAYS[String(rawSub?.planCode || "monthly").toLowerCase()] || 30) : 3;
    const start = new Date(today.getTime() - (days - 1) * DAY);
    const rows = await prisma.aiUsageDaily.findMany({ where: { userId: req.userId, usageDate: { gte: start, lte: today } }, select: { total: true, toolCounts: true } });
    const toolCounts = {};
    let used = 0;
    for (const row of rows) {
      used += Number(row.total || 0);
      for (const [tool, count] of Object.entries(row.toolCounts || {})) toolCounts[tool] = (toolCounts[tool] || 0) + Number(count || 0);
    }
    const limit = sub.isPro ? null : FREE_LIMIT;
    res.json({ date: today.toISOString().slice(0, 10), plan: sub.plan, status: sub.status, planCode: rawSub?.planCode || "free", used, limit, remaining: sub.isPro ? null : Math.max(0, FREE_LIMIT - used), windowDays: days, toolCounts, proToolLimits: sub.isPro ? TOOL_LIMITS_PRO : null, resetAt: new Date(today.getTime() + DAY).toISOString() });
  } catch (error) { next(error); }
});

router.post("/checkout", async (req, res, next) => {
  try {
    const planCode = typeof req.body?.planCode === "string" ? req.body.planCode : "";
    const plan = PLAN_CONFIG[planCode];
    if (!plan) return res.status(400).json({ error: "Choose a valid Pro plan." });
    if (plan.amountUsdCents < 200) return res.status(400).json({ error: "This plan is below Paystack's documented $2.00 USD minimum. Adjust the plan price before enabling checkout." });
    if (!process.env[plan.env]) return res.status(503).json({ error: "This billing interval has not been configured in the payment provider yet." });
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true, name: true } });
    if (!user) return res.status(401).json({ error: "Account not found." });
    const reference = "at_" + crypto.randomUUID().replace(/-/g, "");
    const transaction = await prisma.paymentTransaction.create({ data: { userId: req.userId, reference, planCode, amountMinor: plan.amountUsdCents, currency: "USD", status: "PENDING" } });
    try {
      const callbackUrl = (process.env.FRONTEND_ORIGIN || "https://academic-tracker-nu.vercel.app").split(",")[0].trim().replace(/\/$/, "") + "/subscription.html?payment=return";
      const initialized = await paystackRequest("/transaction/initialize", { method: "POST", body: JSON.stringify({
        email: user.email, amount: plan.amountUsdCents, currency: "USD", reference,
        plan: process.env[plan.env], callback_url: callbackUrl,
        metadata: { userId: req.userId, planCode, transactionId: transaction.id }
      }) });
      await prisma.paymentTransaction.update({ where: { reference }, data: { checkoutUrl: initialized.authorization_url } });
      return res.status(201).json({ authorizationUrl: initialized.authorization_url, reference });
    } catch (error) {
      await prisma.paymentTransaction.update({ where: { reference }, data: { status: "FAILED" } }).catch(() => {});
      throw error;
    }
  } catch (error) { next(error); }
});

router.post("/verify", async (req, res, next) => {
  try {
    const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
    if (!reference || reference.length > 120) return res.status(400).json({ error: "A valid payment reference is required." });
    const payment = await prisma.paymentTransaction.findFirst({ where: { reference, userId: req.userId } });
    if (!payment) return res.status(404).json({ error: "Payment reference not found for this account." });
    if (payment.status !== "SUCCESS") {
      const verified = await paystackRequest("/transaction/verify/" + encodeURIComponent(reference), { method: "GET" });
      await applySuccessfulPayment(reference, verified, "verify");
    }
    const updated = await prisma.paymentTransaction.findUnique({ where: { reference }, select: { status: true } });
    if (updated?.status !== "SUCCESS") return res.status(402).json({ error: "Payment is not confirmed yet." });
    return res.json({ ok: true, subscription: currentSubscription(await getCurrentSubscription(req.userId)) });
  } catch (error) { next(error); }
});

router.post("/cancel", async (req, res, next) => {
  try {
    const sub = await getCurrentSubscription(req.userId);
    const state = currentSubscription(sub);
    if (!state.isPro || state.status !== "ACTIVE") return res.status(409).json({ error: "There is no active paid subscription to cancel." });
    if (!sub.providerSubscriptionCode || !sub.providerSubscriptionToken) {
      return res.status(503).json({ error: "The payment provider has not returned the cancellation details for this subscription yet. Please contact support before assuming renewal is disabled." });
    }
    const providerToken = decryptProviderToken(sub.providerSubscriptionToken);
    if (!providerToken) return res.status(503).json({ error: "The saved provider cancellation token could not be read securely. Please contact support." });
    await paystackRequest("/subscription/disable", { method: "POST", body: JSON.stringify({ code: sub.providerSubscriptionCode, token: providerToken }) });
    const updated = await prisma.userSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    res.json({ subscription: currentSubscription(updated), message: "Renewal is disabled. Pro access remains available until the paid period ends." });
  } catch (error) { next(error); }
});

router.get("/purchases", async (req, res, next) => {
  try {
    const purchases = await prisma.studyPackPurchase.findMany({ where: { userId: req.userId, status: "PAID" }, include: { pack: { select: { slug: true, title: true, description: true, content: true } } }, orderBy: { paidAt: "desc" } });
    res.json({ purchases });
  } catch (error) { next(error); }
});

module.exports = { router, currentSubscription, getCurrentSubscription, FREE_LIMIT, TOOL_LIMITS_PRO };
