const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Cursor-based reads make account exports complete without arbitrary row caps.
async function fetchAllPages(delegate, args, pageSize = 500) {
  const rows = [];
  let cursor;
  while (true) {
    const page = await delegate.findMany({ ...args, orderBy: { id: "asc" }, take: pageSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    rows.push(...page);
    if (page.length < pageSize) return rows;
    cursor = page[page.length - 1].id;
  }
}
router.use(rateLimit({ windowMs: 60 * 1000, limit: 3, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: req => req.userId }));


const accountDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: req => req.userId,
  message: { error: "Too many account deletion attempts. Please try again later." }
});

// Permanently delete the authenticated account and all rows owned by it.
// The current password and explicit confirmation are required; the final
// administrator is protected so the application cannot lose its only owner.
router.delete("/me", accountDeletionLimiter, async (req, res, next) => {
  try {
    const password = req.body?.password;
    const confirmation = req.body?.confirmation;
    if (typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "Enter your current password to continue." });
    }
    if (confirmation !== "DELETE") {
      return res.status(400).json({ error: 'Type DELETE exactly to confirm account removal.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true, passwordHash: true }
    });
    if (!user) return res.status(404).json({ error: "Account not found." });
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) return res.status(401).json({ error: "Your current password is incorrect." });

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${req.userId} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: req.userId },
        select: { id: true, role: true }
      });
      if (!current) return "missing";

      if (["ADMIN", "DEVELOPER", "DEV"].includes(current.role)) {
        const adminCount = await tx.user.count({
          where: { role: { in: ["ADMIN", "DEVELOPER", "DEV"] } }
        });
        if (adminCount <= 1) return "last-admin";
      }

      // All user-owned academic, AI, support, subscription, credit, payment,
      // and notification records use database cascade deletion.
      await tx.user.delete({ where: { id: req.userId } });
      return "deleted";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result === "missing") return res.status(404).json({ error: "Account not found." });
    if (result === "last-admin") {
      return res.status(409).json({ error: "This is the only administrator account. Create another administrator before deleting it." });
    }
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return res.status(409).json({ error: "Account deletion conflicted with another account change. Please try again." });
    }
    next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, name: true, email: true, role: true, educationTrack: true,
        institutionName: true, programme: true, studyLevel: true,
        currentAcademicYear: true, currentTerm: true, currentSemester: true,
        createdAt: true, updatedAt: true
      }
    });
    if (!user) return res.status(404).json({ error: "Account not found." });
    const [subjects, courses, quizAttempts, savedRecords, deletedSubjects, supportConversation] = await Promise.all([
      prisma.subject.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: "asc" },
        include: { assessmentScores: { orderBy: { updatedAt: "desc" } } }
      }),
      prisma.universityCourse.findMany({
        where: { userId: req.userId },
        orderBy: { code: "asc" },
        include: { results: { where: { userId: req.userId }, orderBy: { updatedAt: "desc" } } }
      }),
      fetchAllPages(prisma.aiQuizAttempt, {
        where: { userId: req.userId },
        select: {
          id: true, title: true, subject: true, topic: true, difficulty: true,
          questionData: true, submittedAnswers: true, resultData: true,
          status: true, createdAt: true, completedAt: true
        }
      }),
      fetchAllPages(prisma.userDataRecord, {
        where: { userId: req.userId },
        select: { kind: true, recordId: true, data: true, deletedAt: true, createdAt: true, updatedAt: true }
      }),
      prisma.subjectDeletion.findMany({
        where: { userId: req.userId },
        orderBy: { deletedAt: "asc" },
        select: { subjectId: true, deletedAt: true }
      }),
      prisma.supportConversation.findUnique({
        where: { userId: req.userId },
        select: {
          id: true, status: true, createdAt: true, updatedAt: true,
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, senderId: true, body: true, readAt: true, createdAt: true }
          }
        }
      })
    ]);
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Disposition", 'attachment; filename="academic-tracker-account-export.json"');
    res.json({
      app: "Academic Tracker",
      exportVersion: 2,
      exportedAt: new Date().toISOString(),
      user,
      subjects,
      universityCourses: courses,
      aiQuizAttempts: quizAttempts,
      savedRecords,
      deletedSubjects,
      supportConversation
    });
  } catch (error) { next(error); }
});

module.exports = router;
