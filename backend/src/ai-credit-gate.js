const { randomUUID } = require("node:crypto");
const { prisma } = require("./prisma");

function estimateCredits(body = {}) {
  const action = typeof body.action === "string" ? body.action : "";
  const chars = typeof body.content === "string" ? Math.min(body.content.length, 12000) : 0;
  const inputUnits = Math.ceil(chars / 1000);
  const rawCount = action === "quiz" ? Number(body.questionCount ?? 5) : action === "flashcards" ? Number(body.cardCount ?? 10) : 0;
  const count = Number.isSafeInteger(rawCount) ? rawCount : 0;
  const base = ({ tutor: 3, quiz: 5, summarize: 4, "study-plan": 4, flashcards: 4 })[action] || 4;
  const countUnits = action === "quiz" ? Math.max(0, Math.min(10, count)) * 2 : action === "flashcards" ? Math.max(0, Math.min(20, count)) * 2 : 0;
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
      // The wallet cache is reconciled from active lots below; never decrement blindly.
    }
    const lots = await tx.creditLot.findMany({
      where: { userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }]
    });
    const available = lots.reduce((sum, lot) => sum + lot.remainingCredits, 0);
    await tx.creditWallet.updateMany({ where: { userId }, data: { balance: available } });
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
    await tx.creditWallet.updateMany({ where: { userId }, data: { balance: available - amount } });
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
    // Lock first, then check idempotency. Checking before the lock permits two
    // concurrent callbacks to both observe no refund ledger row and refund twice.
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
        // Do not silently lose credits if the original lot expires while the
        // provider request is running; issue a fresh 30-day refund lot.
        await tx.creditLot.create({ data: { userId, originalCredits: restore, remainingCredits: restore, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } });
      }
      remaining -= restore;
    }
    if (remaining > 0) throw new Error("Could not restore the full AI credit reservation.");
    const validLots = await tx.creditLot.aggregate({ where: { userId, remainingCredits: { gt: 0 }, expiresAt: { gt: now } }, _sum: { remainingCredits: true } });
    await tx.creditWallet.updateMany({ where: { userId }, data: { balance: validLots._sum.remainingCredits || 0 } });
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
          .then(() => sendJson({ ...payload, creditUsage: { charged, estimated: !Number.isInteger(req.aiActualCredits), balance: reservation.available + unused } }))
          .catch(error => {
            console.error("AI credit settlement failed:", error.code || error.name);
            // Report the amount actually guaranteed to remain after reservation.
            sendJson({ ...payload, creditUsage: { charged: reservation.amount, estimated: true, balance: reservation.available } });
          });
        return res;
      }
      return sendJson({ ...payload, creditUsage: { charged, estimated: !Number.isInteger(req.aiActualCredits), balance: reservation.available } });
    };
    return next();
  } catch (error) { return next(error); }
}

module.exports = { aiCreditGate, estimateCredits, reserveCredits, refundCredits };
