const { randomUUID } = require("node:crypto");
const { prisma } = require("./prisma");

function estimateCredits(body = {}) {
  const action = typeof body.action === "string" ? body.action : "";
  const chars = typeof body.content === "string" ? body.content.length : 0;
  const inputUnits = Math.ceil(chars / 2000);
  const count = action === "quiz" ? Number(body.questionCount || 5) : action === "flashcards" ? Number(body.cardCount || 10) : 0;
  const base = ({ tutor: 3, quiz: 5, summarize: 4, "study-plan": 4, flashcards: 4 })[action] || 4;
  const countUnits = action === "quiz" ? Math.max(0, Math.min(10, count)) * 2 : action === "flashcards" ? Math.max(0, Math.min(20, count)) : 0;
  return Math.max(1, Math.min(60, base + inputUnits + countUnits));
}

async function reserveCredits(userId, amount) {
  const reservationId = randomUUID();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const now = new Date();
    const access = await tx.premiumAccess.findUnique({ where: { userId } });
    const premiumActive = Boolean(access && access.expiresAt > now);
    const expired = await tx.creditLot.aggregate({ where: { userId, remainingCredits: { gt: 0 }, expiresAt: { lte: now } }, _sum: { remainingCredits: true } });
    const expiredCredits = expired._sum.remainingCredits || 0;
    if (expiredCredits > 0) {
      await tx.creditLot.updateMany({ where: { userId, remainingCredits: { gt: 0 }, expiresAt: { lte: now } }, data: { remainingCredits: 0 } });
      await tx.creditWallet.updateMany({ where: { userId }, data: { balance: { decrement: expiredCredits } } });
    }
    const lots = await tx.creditLot.findMany({
      where: { userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }]
    });
    const available = lots.reduce((sum, lot) => sum + lot.remainingCredits, 0);
    if (!premiumActive && available === 0) return { premium: false };
    if (available < amount) return { premium: true, insufficient: true, available };
    let remaining = amount;
    const allocations = [];
    for (const lot of lots) {
      if (!remaining) break;
      const take = Math.min(remaining, lot.remainingCredits);
      await tx.creditLot.update({ where: { id: lot.id }, data: { remainingCredits: { decrement: take } } });
      allocations.push({ lotId: lot.id, credits: take });
      remaining -= take;
    }
    await tx.creditWallet.updateMany({ where: { userId }, data: { balance: { decrement: amount } } });
    await tx.creditLedger.create({
      data: { userId, delta: -amount, kind: "AI_USAGE", reference: "ai:" + reservationId, description: "AI learning request (estimated usage)" }
    });
    return { premium: true, reservationId, amount, allocations, available: available - amount };
  }, { isolationLevel: "Serializable" });
}

async function refundCredits(userId, reservation, creditsToRefund = reservation?.amount) {
  if (!reservation?.premium || !reservation.reservationId || !Number.isInteger(creditsToRefund) || creditsToRefund <= 0) return;
  creditsToRefund = Math.min(creditsToRefund, reservation.amount);
  await prisma.$transaction(async tx => {
    const existing = await tx.creditLedger.findUnique({ where: { reference: "refund:" + reservation.reservationId } });
    if (existing) return;
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    let remaining = creditsToRefund;
    for (const allocation of [...reservation.allocations].reverse()) {
      if (!remaining) break;
      const restore = Math.min(remaining, allocation.credits);
      await tx.creditLot.updateMany({
        where: { id: allocation.lotId, userId },
        data: { remainingCredits: { increment: restore } }
      });
      remaining -= restore;
    }
    await tx.creditWallet.updateMany({ where: { userId }, data: { balance: { increment: creditsToRefund } } });
    await tx.creditLedger.create({
      data: { userId, delta: creditsToRefund, kind: "AI_REFUND", reference: "refund:" + reservation.reservationId, description: "Refund of unused or unsuccessful AI credits" }
    });
  }, { isolationLevel: "Serializable" });
}

async function aiCreditGate(req, res, next) {
  try {
    const amount = estimateCredits(req.body || {});
    const reservation = await reserveCredits(req.userId, amount);
    if (!reservation.premium) return next();
    if (reservation.insufficient) {
      return res.status(402).json({
        error: "You need more AI credits for this request. Top up your wallet or choose a credit package.",
        code: "INSUFFICIENT_AI_CREDITS",
        balance: reservation.available,
        estimatedCredits: amount
      });
    }
    req.aiCreditReservation = reservation;
    const sendJson = res.json.bind(res);
    let finalized = false;
    res.json = payload => {
      if (finalized) return res;
      finalized = true;
      if (res.statusCode >= 400) {
        refundCredits(req.userId, reservation)
          .catch(error => console.error("AI credit refund failed:", error.code || error.name))
          .finally(() => sendJson(payload));
        return res;
      }
      const charged = Number.isInteger(req.aiActualCredits) ? Math.min(reservation.amount, Math.max(1, req.aiActualCredits)) : reservation.amount;
      const unused = reservation.amount - charged;
      if (unused > 0) {
        refundCredits(req.userId, reservation, unused)
          .catch(error => console.error("AI credit settlement failed:", error.code || error.name))
          .finally(() => sendJson({ ...payload, creditUsage: { charged, estimated: !Number.isInteger(req.aiActualCredits), balance: reservation.available + unused } }));
        return res;
      }
      return sendJson({ ...payload, creditUsage: { charged, estimated: !Number.isInteger(req.aiActualCredits), balance: reservation.available } });
    };
    return next();
  } catch (error) { return next(error); }
}

module.exports = { aiCreditGate, estimateCredits, reserveCredits, refundCredits };
