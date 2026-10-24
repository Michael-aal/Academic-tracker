const express = require("express");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
const TYPES = new Set(["CA1", "CA2", "CA3", "EXAM", "TEST"]);
const CA_TYPES = new Set(["CA1", "CA2", "CA3"]);
const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validNumber = (value) => typeof value === "number" && Number.isFinite(value);
const asDate = (value) => {
  if (!value) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) ? undefined : date;
};

router.get("/", async (req, res, next) => {
  try {
    const where = { userId: req.userId };
    if (typeof req.query.academicYear === "string" && req.query.academicYear.trim()) where.academicYear = req.query.academicYear.trim().slice(0, 30);
    if (typeof req.query.term === "string" && req.query.term.trim()) where.term = req.query.term.trim().slice(0, 20);
    const goals = await prisma.assessmentGoal.findMany({ where, include: { subject: { select: { id: true, name: true } } }, orderBy: [{ assessmentDate: "asc" }, { createdAt: "desc" }] });
    res.json({ goals });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const subjectId = clean(req.body?.subjectId, 100);
    const academicYear = clean(req.body?.academicYear, 30);
    const term = clean(req.body?.term, 20);
    const assessmentType = clean(req.body?.assessmentType, 20).toUpperCase();
    const maxScore = CA_TYPES.has(assessmentType) ? 10 : req.body?.maxScore;
    const targetScore = req.body?.targetScore;
    const assessmentDate = asDate(req.body?.assessmentDate);
    if (!subjectId || !academicYear || !term) return res.status(400).json({ error: "Subject, academic year, and term are required." });
    if (!TYPES.has(assessmentType)) return res.status(400).json({ error: "Choose CA1, CA2, CA3, Exam, or Test." });
    if (!validNumber(maxScore) || maxScore < 1 || maxScore > 100 || !validNumber(targetScore) || targetScore < 0 || targetScore > maxScore) return res.status(400).json({ error: "Enter a valid target and maximum mark." });
    if (assessmentDate === undefined) return res.status(400).json({ error: "Enter a valid assessment date." });
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId: req.userId }, select: { id: true } });
    if (!subject) return res.status(404).json({ error: "Subject not found in your account." });
    const goal = await prisma.assessmentGoal.create({ data: { userId: req.userId, subjectId, academicYear, term, assessmentType, targetScore, maxScore, assessmentDate } , include: { subject: { select: { id: true, name: true } } } });
    res.status(201).json({ goal });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "A goal already exists for this subject, term, and assessment. Edit the existing goal instead." });
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.assessmentGoal.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: "Assessment goal not found." });
    const data = {};
    if (req.body?.targetScore !== undefined) {
      if (!validNumber(req.body.targetScore) || req.body.targetScore < 0 || req.body.targetScore > existing.maxScore) return res.status(400).json({ error: "Target must be between zero and the maximum mark." });
      data.targetScore = req.body.targetScore;
    }
    if (req.body?.actualScore !== undefined) {
      if (req.body.actualScore === null || req.body.actualScore === "") { data.actualScore = null; data.completedAt = null; }
      else {
        if (!validNumber(req.body.actualScore) || req.body.actualScore < 0 || req.body.actualScore > existing.maxScore) return res.status(400).json({ error: "Actual score must be between zero and the maximum mark." });
        data.actualScore = req.body.actualScore; data.completedAt = new Date();
      }
    }
    if (req.body?.assessmentDate !== undefined) {
      const date = asDate(req.body.assessmentDate);
      if (date === undefined) return res.status(400).json({ error: "Enter a valid assessment date." });
      data.assessmentDate = date;
    }
    if (req.body?.reflectionReason !== undefined) data.reflectionReason = req.body.reflectionReason === null ? null : clean(req.body.reflectionReason, 1000);
    if (req.body?.improvementPlan !== undefined) data.improvementPlan = req.body.improvementPlan === null ? null : clean(req.body.improvementPlan, 2000);
    if (!Object.keys(data).length) return res.status(400).json({ error: "No supported changes were provided." });
    const goal = await prisma.assessmentGoal.update({ where: { id: existing.id }, data, include: { subject: { select: { id: true, name: true } } } });
    res.json({ goal, targetMet: goal.actualScore !== null && goal.actualScore >= goal.targetScore, targetMissed: goal.actualScore !== null && goal.actualScore < goal.targetScore });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await prisma.assessmentGoal.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (!result.count) return res.status(404).json({ error: "Assessment goal not found." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
