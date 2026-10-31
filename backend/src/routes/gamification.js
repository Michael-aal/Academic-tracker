const express = require("express");
const { randomUUID, createHash } = require("node:crypto");
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

function stableEventKey(prefix, value) {
  return prefix + ":" + createHash("sha256").update(String(value)).digest("hex").slice(0, 48);
}

const CATEGORY_LABELS = {
  vocabulary: "Vocabulary",
  spelling: "Spelling",
  grammar: "Grammar",
  partsOfSpeech: "Parts of speech",
  figuresOfSpeech: "Figures of speech",
  comprehension: "Reading comprehension",
  oralEnglish: "Oral English",
  writingSkills: "Writing skills",
  idiomsAndPhrases: "Idioms and phrases",
  sentenceCorrection: "Sentence correction"
};

router.get("/me", async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await getSnapshot(prisma, req.userId));
  } catch (error) { next(error); }
});

router.get("/insights", async (req, res, next) => {
  try {
    const attempts = await prisma.aiQuizAttempt.findMany({
      where: { userId: req.userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 100,
      select: { subject: true, topic: true, resultData: true, completedAt: true }
    });
    const groups = new Map();
    for (const attempt of attempts) {
      const subject = String(attempt.subject || "General").trim() || "General";
      const topic = String(attempt.topic || "General practice").trim() || "General practice";
      const key = (subject + "::" + topic).toLocaleLowerCase();
      const percentage = Number(attempt.resultData?.percentage);
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) continue;
      const group = groups.get(key) || { subject, topic, total: 0, attempts: 0, best: 0, latestAt: attempt.completedAt };
      group.total += percentage;
      group.attempts += 1;
      group.best = Math.max(group.best, percentage);
      if (!group.latestAt || (attempt.completedAt && attempt.completedAt > group.latestAt)) group.latestAt = attempt.completedAt;
      groups.set(key, group);
    }
    const topics = [...groups.values()].map(group => ({
      subject: group.subject, topic: group.topic, attempts: group.attempts,
      average: Math.round(group.total / group.attempts), best: group.best,
      confidence: group.attempts >= 3 ? "stronger signal" : group.attempts === 2 ? "early pattern" : "limited evidence",
      latestAt: group.latestAt
    })).sort((a, b) => a.average - b.average);
    const weakTopics = topics.filter(item => item.average < 70).slice(0, 6);
    const overallAverage = topics.length ? Math.round(topics.reduce((sum, item) => sum + item.average * item.attempts, 0) / topics.reduce((sum, item) => sum + item.attempts, 0)) : null;
    const recommendations = weakTopics.map(item => ({
      subject: item.subject, topic: item.topic,
      message: item.average < 50 ? "Review the lesson, then practise a smaller set of questions." : "Revisit the key ideas and try another practice quiz.",
      evidence: item.confidence
    }));
    if (!attempts.length) recommendations.push({ subject: "Getting started", topic: "First practice", message: "Complete a quiz to begin building evidence-based topic insights.", evidence: "No completed quizzes yet" });
    res.set("Cache-Control", "private, no-store");
    res.json({ completedQuizCount: attempts.length, overallAverage, topics, weakTopics, recommendations });
  } catch (error) { next(error); }
});

router.get("/english/stories", async (req, res, next) => {
  try {
    const records = await prisma.userDataRecord.findMany({ where: { userId: req.userId, kind: "english-stories" }, orderBy: { updatedAt: "desc" }, take: 30, select: { recordId: true, data: true, createdAt: true } });
    res.set("Cache-Control", "private, no-store");
    res.json({ stories: records.map(record => ({ ...record.data, id: record.recordId, createdAt: record.createdAt })) });
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
        if (!item || typeof item.questionId !== "string" || !Number.isInteger(item.optionIndex) || item.optionIndex < 0 || item.optionIndex > 3 ||
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
      eventKey: stableEventKey("study-session", req.params.recordId), activity: "study",
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
      eventKey: stableEventKey("flashcard:" + date, req.params.recordId), activity: "flashcard",
      description: "Reviewed a flashcard", points: 1
    }));
    res.json({ xpAwarded: result.awarded, duplicate: result.duplicate });
  } catch (error) { next(error); }
});

module.exports = router;
