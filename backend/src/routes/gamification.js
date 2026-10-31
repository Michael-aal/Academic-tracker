const express = require("express");
const { randomUUID } = require("node:crypto");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/auth");
const { prisma } = require("../prisma");
const { awardXp, getSnapshot, levelForXp } = require("../level-system");
const { categories, makeChallenge } = require("../english-question-bank");

const router = express.Router();
router.use(requireAuth);
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: req => req.userId,
  message: { error: "Too many learning activity requests. Please slow down." }
}));

const CATEGORY_LABELS = {
  vocabulary: "Vocabulary",
  spelling: "Spelling",
  grammar: "Grammar",
  partsOfSpeech: "Parts of speech",
  figuresOfSpeech: "Figures of speech",
  comprehension: "Reading comprehension",
  oralEnglish: "Oral English"
};

router.get("/me", async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await getSnapshot(prisma, req.userId));
  } catch (error) { next(error); }
});

router.get("/english/categories", (_req, res) => {
  res.json({ categories: categories().map(id => ({ id, name: CATEGORY_LABELS[id] })) });
});

router.get("/english/challenge", async (req, res, next) => {
  try {
    const category = String(req.query.category || "vocabulary");
    if (!categories().includes(category)) return res.status(400).json({ error: "Choose a valid English practice category." });
    const challengeId = randomUUID();
    const questions = makeChallenge(category, 5);
    await prisma.userDataRecord.create({
      data: {
        userId: req.userId, kind: "english-challenges", recordId: challengeId,
        data: { category, questions, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), submittedAt: null }
      }
    });
    res.set("Cache-Control", "private, no-store");
    res.json({
      challengeId, category, title: CATEGORY_LABELS[category] + " practice",
      questions: questions.map(({ answer, explanation, ...question }) => ({ ...question, options: question.options.map((text, index) => ({ id: String(index), text })) }))
    });
  } catch (error) { next(error); }
});

router.post("/english/submit", async (req, res, next) => {
  try {
    const { challengeId, answers } = req.body || {};
    if (typeof challengeId !== "string" || challengeId.length > 120 || !Array.isArray(answers) || answers.length > 10) {
      return res.status(400).json({ error: "Submit a valid practice challenge and its answers." });
    }
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${req.userId} FOR UPDATE`;
      const challenge = await tx.userDataRecord.findUnique({
        where: { userId_kind_recordId: { userId: req.userId, kind: "english-challenges", recordId: challengeId } }
      });
      if (!challenge) return { status: 404, body: { error: "This practice challenge was not found. Start a new one." } };
      const data = challenge.data;
      if (data.submittedAt) return { status: 409, body: { error: "This challenge has already been submitted." } };
      if (!data.expiresAt || Date.parse(data.expiresAt) < Date.now()) return { status: 410, body: { error: "This challenge has expired. Start a new one." } };
      const questions = Array.isArray(data.questions) ? data.questions : [];
      const answerMap = new Map();
      for (const item of answers) {
        if (!item || typeof item.questionId !== "string" || !Number.isInteger(item.optionIndex) ||
            answerMap.has(item.questionId)) return { status: 400, body: { error: "One or more submitted answers are invalid." } };
        answerMap.set(item.questionId, item.optionIndex);
      }
      if (answerMap.size !== questions.length || questions.some(question => !answerMap.has(question.id))) {
        return { status: 400, body: { error: "Answer every question before submitting." } };
      }
      const review = questions.map(question => {
        const selected = answerMap.get(question.id);
        const correct = selected === question.answer;
        return { questionId: question.id, question: question.question, selectedIndex: selected, correctIndex: question.answer, isCorrect: correct, explanation: question.explanation };
      });
      const correct = review.filter(item => item.isCorrect).length;
      const percentage = Math.round((correct / questions.length) * 100);
      const xp = 8 + correct * 2;
      const xpResult = await awardXp(tx, req.userId, {
        eventKey: "english:" + challengeId, activity: "english",
        description: CATEGORY_LABELS[data.category] + " practice (" + correct + "/" + questions.length + ")",
        points: xp
      });
      await tx.userDataRecord.update({
        where: { userId_kind_recordId: { userId: req.userId, kind: "english-challenges", recordId: challengeId } },
        data: { data: { ...data, submittedAt: new Date().toISOString(), result: { correct, total: questions.length, percentage } } }
      });
      return { status: 200, body: { correct, total: questions.length, percentage, review, xpAwarded: xpResult.awarded, level: xpResult.profile ? levelForXp(xpResult.profile.totalXp) : null } };
    });
    return res.status(outcome.status).json(outcome.body);
  } catch (error) { next(error); }
});

router.post("/quiz/:attemptId/claim", async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const attempt = await tx.aiQuizAttempt.findFirst({ where: { id: req.params.attemptId, userId: req.userId } });
      if (!attempt || attempt.status !== "COMPLETED" || !attempt.resultData) return null;
      const percentage = Math.max(0, Math.min(100, Number(attempt.resultData.percentage) || 0));
      return awardXp(tx, req.userId, {
        eventKey: "quiz:" + attempt.id, activity: "quiz",
        description: "Completed " + String(attempt.title || "revision quiz").slice(0, 100),
        points: 10 + Math.round(percentage / 10)
      });
    });
    if (!result) return res.status(404).json({ error: "Completed quiz not found." });
    res.json({ xpAwarded: result.awarded, duplicate: result.duplicate, level: result.profile ? levelForXp(result.profile.totalXp) : null });
  } catch (error) { next(error); }
});

router.post("/study-session/:recordId/claim", async (req, res, next) => {
  try {
    const session = await prisma.userDataRecord.findUnique({
      where: { userId_kind_recordId: { userId: req.userId, kind: "study-sessions", recordId: req.params.recordId } },
      select: { data: true }
    });
    if (!session || session.data?.completed !== true) return res.status(409).json({ error: "Complete and sync this study session before claiming XP." });
    const result = await prisma.$transaction(tx => awardXp(tx, req.userId, {
      eventKey: "study-session:" + req.params.recordId, activity: "study",
      description: "Completed a planned study session", points: 5
    }));
    res.json({ xpAwarded: result.awarded, duplicate: result.duplicate });
  } catch (error) { next(error); }
});

router.post("/flashcard/:recordId/claim", async (req, res, next) => {
  try {
    const card = await prisma.userDataRecord.findUnique({
      where: { userId_kind_recordId: { userId: req.userId, kind: "memory-cards", recordId: req.params.recordId } },
      select: { data: true }
    });
    if (!card || typeof card.data?.question !== "string" || typeof card.data?.answer !== "string") return res.status(404).json({ error: "Saved flashcard not found." });
    const date = new Date().toISOString().slice(0, 10);
    const result = await prisma.$transaction(tx => awardXp(tx, req.userId, {
      eventKey: "flashcard:" + req.params.recordId + ":" + date, activity: "flashcard",
      description: "Reviewed a flashcard", points: 1
    }));
    res.json({ xpAwarded: result.awarded, duplicate: result.duplicate });
  } catch (error) { next(error); }
});

module.exports = router;
