const express = require("express");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { TERMS, validPeriod, validateScores } = require("../validation");

const router = express.Router();
router.use(requireAuth);

async function resolvePeriod(req) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { currentAcademicYear: true, currentTerm: true } });
  const academicYear = typeof req.query.academicYear === "string" ? req.query.academicYear.trim() : user.currentAcademicYear;
  const term = typeof req.query.term === "string" ? req.query.term : user.currentTerm;
  return { academicYear, term };
}

router.get("/", async (req, res, next) => {
  try {
    const { academicYear, term } = await resolvePeriod(req);
    if (!validPeriod(academicYear, term)) return res.status(400).json({ error: "Provide a valid academicYear and term." });
    const scores = await prisma.assessmentScore.findMany({
      where: { userId: req.userId, academicYear, term },
      orderBy: { createdAt: "asc" }
    });
    res.json({ scores, academicYear, term });
  } catch (error) {
    next(error);
  }
});

router.put("/:subjectId", async (req, res, next) => {
  try {
    const { academicYear, term } = req.body || {};
    if (!validPeriod(academicYear, term)) return res.status(400).json({ error: "academicYear and a valid term are required." });
    if (!TERMS.has(term)) return res.status(400).json({ error: "Choose Term 1, Term 2, or Term 3." });

    const subject = await prisma.subject.findFirst({
      where: { id: req.params.subjectId, userId: req.userId },
      select: { id: true }
    });
    if (!subject) return res.status(404).json({ error: "Subject not found." });

    const validated = validateScores(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const score = await prisma.assessmentScore.upsert({
      where: {
        subjectId_academicYear_term: {
          subjectId: subject.id,
          academicYear: academicYear.trim(),
          term
        }
      },
      create: {
        userId: req.userId,
        subjectId: subject.id,
        academicYear: academicYear.trim(),
        term,
        ...validated.value
      },
      update: validated.value
    });
    res.json({ score });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
