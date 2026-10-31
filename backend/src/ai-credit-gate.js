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
    if (!access || access.expiresAt <= now) return { premium: false };
    const lots = await tx.creditLot.findMany({
      where: { userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }]
    });
    const available = lots.reduce((sum, lot) => sum + lot.remainingCredits, 0);
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

async function refundCredits(userId, reservation) {
  if (!reservation?.premium || !reservation.reservationId) return;
  await prisma.$transaction(async tx => {
    const existing = await tx.creditLedger.findUnique({ where: { reference: "refund:" + reservation.reservationId } });
    if (existing) return;
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    for (const allocation of reservation.allocations) {
      await tx.creditLot.updateMany({
        where: { id: allocation.lotId, userId },
        data: { remainingCredits: { increment: allocation.credits } }
      });
    }
    await tx.creditWallet.updateMany({ where: { userId }, data: { balance: { increment: reservation.amount } } });
    await tx.creditLedger.create({
      data: { userId, delta: reservation.amount, kind: "AI_REFUND", reference: "refund:" + reservation.reservationId, description: "Refund for unsuccessful AI request" }
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
      return sendJson({ ...payload, creditUsage: { charged: reservation.amount, estimated: true, balance: reservation.available } });
    };
    return next();
  } catch (error) { return next(error); }
}

module.exports = { aiCreditGate, estimateCredits, reserveCredits, refundCredits };
