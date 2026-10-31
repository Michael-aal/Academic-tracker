const { randomUUID } = require("node:crypto");
const { prisma } = require("./prisma");

const FREE_CREDIT_ALLOWANCE = 60;
const FREE_CREDIT_INTERVAL_MS = 72 * 60 * 60 * 1000;
const ACTION_CREDIT_COSTS = Object.freeze({
  tutor: 2,
  quiz: 3,
  summarize: 2,
  "study-plan": 2,
  flashcards: 2,
  english: 1
});

function estimateCredits(body = {}) {
  const action = typeof body.action === "string" ? body.action : "";
  return ACTION_CREDIT_COSTS[action] || 2;
}

async function ensureFreeCredits(userId, now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const access = await tx.premiumAccess.findUnique({ where: { userId } });
    if (access && access.expiresAt > now) return { granted: false, reason: "premium" };

    const lastGrant = await tx.creditLedger.findFirst({
      where: { userId, kind: "FREE_REFRESH" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
    if (lastGrant && now.getTime() - lastGrant.createdAt.getTime() < FREE_CREDIT_INTERVAL_MS) {
      return {
        granted: false,
        nextRefreshAt: new Date(lastGrant.createdAt.getTime() + FREE_CREDIT_INTERVAL_MS)
      };
    }

    const expiresAt = new Date(now.getTime() + FREE_CREDIT_INTERVAL_MS);
    await tx.creditLot.create({
      data: {
        userId,
        originalCredits: FREE_CREDIT_ALLOWANCE,
        remainingCredits: FREE_CREDIT_ALLOWANCE,
        expiresAt
      }
    });
    await tx.creditLedger.create({
      data: {
        userId,
        delta: FREE_CREDIT_ALLOWANCE,
        kind: "FREE_REFRESH",
        reference: "free-refresh:" + userId + ":" + now.getTime(),
        description: "Free plan AI credits refreshed"
      }
    });

    const validLots = await tx.creditLot.aggregate({
      where: { userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } },
      _sum: { remainingCredits: true }
    });
    const balance = validLots._sum.remainingCredits || 0;
    await tx.creditWallet.upsert({
      where: { userId },
      create: { userId, balance },
      update: { balance }
    });
    return { granted: true, amount: FREE_CREDIT_ALLOWANCE, expiresAt, balance };
  }, { isolationLevel: "Serializable" });
}

async function reserveCredits(userId, amount) {
  await ensureFreeCredits(userId);
  const reservationId = randomUUID();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const now = new Date();
    const expiredLots = await tx.creditLot.findMany({
      where: { userId, remainingCredits: { gt: 0 }, expiresAt: { lte: now } },
      select: { id: true, remainingCredits: true }
    });
    for (const lot of expiredLots) {
      await tx.creditLot.update({ where: { id: lot.id }, data: { remainingCredits: 0 } });
      await tx.creditLedger.create({
        data: { userId, delta: -lot.remainingCredits, kind: "EXPIRED", reference: "expire:" + lot.id, description: "Unused AI credits expired" }
      });
    }
    const lots = await tx.creditLot.findMany({
      where: { userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }]
    });
    const available = lots.reduce((sum, lot) => sum + lot.remainingCredits, 0);
    await tx.creditWallet.upsert({
      where: { userId },
      create: { userId, balance: available },
      update: { balance: available }
    });
    if (available < amount) return { insufficient: true, available, required: amount };
    let remaining = amount;
    const allocations = [];
    for (const lot of lots) {
      if (!remaining) break;
      const take = Math.min(remaining, lot.remainingCredits);
      await tx.creditLot.update({ where: { id: lot.id }, data: { remainingCredits: { decrement: take } } });
      allocations.push({ lotId: lot.id, credits: take });
      remaining -= take;
    }
    const balance = available - amount;
    await tx.creditWallet.update({ where: { userId }, data: { balance } });
    await tx.creditLedger.create({
      data: { userId, delta: -amount, kind: "AI_USAGE", reference: "ai:" + reservationId, description: "AI request credit reservation" }
    });
    return { reserved: true, reservationId, amount, allocations, available: balance };
  }, { isolationLevel: "Serializable" });
}

async function refundCredits(userId, reservation, creditsToRefund = reservation?.amount) {
  if (!reservation?.reserved || !reservation.reservationId || !Number.isInteger(creditsToRefund) || creditsToRefund <= 0) return;
  creditsToRefund = Math.min(creditsToRefund, reservation.amount);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const existing = await tx.creditLedger.findUnique({ where: { reference: "refund:" + reservation.reservationId } });
    if (existing) return;
    let remaining = creditsToRefund;
    const now = new Date();
    for (const allocation of [...reservation.allocations].reverse()) {
      if (!remaining) break;
      const lot = await tx.creditLot.findFirst({ where: { id: allocation.lotId, userId } });
      if (!lot) continue;
      const restore = Math.min(remaining, allocation.credits);
      if (lot.expiresAt > now) {
        await tx.creditLot.update({ where: { id: lot.id }, data: { remainingCredits: { increment: restore } } });
      } else {
        await tx.creditLot.create({
          data: { userId, originalCredits: restore, remainingCredits: restore, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) }
        });
      }
      remaining -= restore;
    }
    if (remaining > 0) throw new Error("Could not restore the full AI credit reservation.");
    const validLots = await tx.creditLot.aggregate({
      where: { userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } },
      _sum: { remainingCredits: true }
    });
    const balance = validLots._sum.remainingCredits || 0;
    await tx.creditWallet.upsert({
      where: { userId },
      create: { userId, balance },
      update: { balance }
    });
    await tx.creditLedger.create({
      data: { userId, delta: creditsToRefund, kind: "AI_REFUND", reference: "refund:" + reservation.reservationId, description: "Refund of unused or unsuccessful AI credits" }
    });
  }, { isolationLevel: "Serializable" });
}

async function aiCreditGate(req, res, next) {
  try {
    const amount = estimateCredits(req.body || {});
    const reservation = await reserveCredits(req.userId, amount);
    if (reservation.insufficient) {
      return res.status(402).json({
        error: "Your AI credit balance is too low. Top up your wallet before using any AI learning tool.",
        code: "INSUFFICIENT_AI_CREDITS",
        balance: reservation.available,
        requiredCredits: reservation.required
      });
    }
    req.aiCreditReservation = reservation;
    const sendJson = res.json.bind(res);
    let finalized = false;
    res.json = payload => {
      if (finalized) return res;
      finalized = true;
      if (res.statusCode >= 400 && !req.aiUsageAuditFailure) {
        refundCredits(req.userId, reservation)
          .catch(error => console.error("AI credit refund failed:", error.code || error.name))
          .finally(() => sendJson(payload));
        return res;
      }
      const charged = Number.isInteger(req.aiActualCredits)
        ? Math.max(1, req.aiActualCredits)
        : reservation.amount;
      const unused = Math.max(0, reservation.amount - charged);
      if (unused > 0) {
        refundCredits(req.userId, reservation, unused)
          .then(() => sendJson({ ...payload, creditUsage: { charged, estimated: !Number.isInteger(req.aiActualCredits), balance: reservation.available + unused } }))
          .catch(error => {
            console.error("AI credit settlement failed:", error.code || error.name);
            sendJson({ ...payload, creditUsage: { charged: reservation.amount, estimated: true, balance: reservation.available } });
          });
        return res;
      }
      return sendJson({ ...payload, creditUsage: { charged, estimated: !Number.isInteger(req.aiActualCredits), balance: reservation.available } });
    };
    return next();
  } catch (error) { return next(error); }
}

module.exports = { aiCreditGate, estimateCredits, reserveCredits, refundCredits, ensureFreeCredits, FREE_CREDIT_ALLOWANCE, FREE_CREDIT_INTERVAL_MS, ACTION_CREDIT_COSTS };
