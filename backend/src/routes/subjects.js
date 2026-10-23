const express = require("express");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { cleanString, validateTarget } = require("../validation");

const router = express.Router();
router.use(requireAuth);

function periodFromQuery(req) {
  const academicYear = typeof req.query.academicYear === "string" ? req.query.academicYear.trim() : "";
  const term = typeof req.query.term === "string" ? req.query.term : "";
  return { academicYear, term };
}

router.get("/", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { currentAcademicYear: true, currentTerm: true } });
    const requested = periodFromQuery(req);
    const academicYear = requested.academicYear || user.currentAcademicYear;
    const term = requested.term || user.currentTerm;
    const subjects = await prisma.subject.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "asc" },
      include: { assessmentScores: { where: { academicYear, term }, take: 1 } }
    });
    res.json({ subjects: subjects.map(({ assessmentScores, ...subject }) => ({ ...subject, score: assessmentScores[0] || null })), academicYear, term });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const name = cleanString(req.body?.name, 70);
    const targetPercentage = req.body?.targetPercentage ?? 75;
    if (name.length < 1) return res.status(400).json({ error: "Subject name is required." });
    if (!validateTarget(targetPercentage)) return res.status(400).json({ error: "Target must be a whole number from 0 to 100." });

    const subject = await prisma.subject.create({
      data: { userId: req.userId, name, normalizedName: name.toLocaleLowerCase("en"), targetPercentage }
    });
    res.status(201).json({ subject });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "You already have a subject with that name." });
    }
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.subject.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: "Subject not found." });

    const data = {};
    if (req.body?.name !== undefined) {
      const name = cleanString(req.body.name, 70);
      if (!name) return res.status(400).json({ error: "Subject name cannot be blank." });
      data.name = name;
      data.normalizedName = name.toLocaleLowerCase("en");
    }
    if (req.body?.targetPercentage !== undefined) {
      if (!validateTarget(req.body.targetPercentage)) return res.status(400).json({ error: "Target must be a whole number from 0 to 100." });
      data.targetPercentage = req.body.targetPercentage;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: "No valid subject fields were provided." });

    const subject = await prisma.subject.update({ where: { id: existing.id }, data });
    res.json({ subject });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "You already have a subject with that name." });
    }
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await prisma.subject.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (!result.count) return res.status(404).json({ error: "Subject not found." });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
