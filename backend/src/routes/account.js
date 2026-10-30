const express = require("express");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60 * 1000, limit: 3, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: req => req.userId }));

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
    const [subjects, courses, quizAttempts, savedRecords, supportConversation] = await Promise.all([
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
      prisma.aiQuizAttempt.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true, title: true, subject: true, topic: true, difficulty: true,
          questionData: true, submittedAnswers: true, resultData: true,
          status: true, createdAt: true, completedAt: true
        }
      }),
      prisma.userDataRecord.findMany({
        where: { userId: req.userId },
        orderBy: { updatedAt: "desc" },
        take: 3000,
        select: { kind: true, recordId: true, data: true, createdAt: true, updatedAt: true }
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
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      user,
      subjects,
      universityCourses: courses,
      aiQuizAttempts: quizAttempts,
      savedRecords,
      supportConversation
    });
  } catch (error) { next(error); }
});

module.exports = router;
