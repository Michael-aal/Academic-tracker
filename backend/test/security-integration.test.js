const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../src/prisma");
const { consumeAiQuota } = require("../src/ai-quota");

const enabled = process.env.RUN_DB_INTEGRATION === "1";

test("PostgreSQL enforces university ownership and concurrent AI quotas", { skip: !enabled }, async () => {
  const suffix = randomUUID();
  const createdUserIds = [];
  try {
    const owner = await prisma.user.create({
      data: { name: "Integration Owner", email: "owner-" + suffix + "@example.test", passwordHash: "test-only-hash" },
      select: { id: true }
    });
    createdUserIds.push(owner.id);
    const other = await prisma.user.create({
      data: { name: "Integration Other", email: "other-" + suffix + "@example.test", passwordHash: "test-only-hash" },
      select: { id: true }
    });
    createdUserIds.push(other.id);

    const course = await prisma.universityCourse.create({
      data: { userId: owner.id, code: "SEC-" + suffix.slice(0, 8), title: "Security Test Course", creditUnits: 3 }
    });
    await prisma.universityCourseResult.create({
      data: { userId: owner.id, courseId: course.id, academicYear: "2026-2027", semester: "Semester 1" }
    });
    await assert.rejects(
      () => prisma.universityCourseResult.create({
        data: { userId: other.id, courseId: course.id, academicYear: "2027-2028", semester: "Semester 1" }
      }),
      error => error.code === "P2003"
    );

    const quotaResults = await Promise.all(Array.from({ length: 15 }, () => consumeAiQuota(prisma, owner.id)));
    assert.equal(quotaResults.filter(Boolean).length, 10, "exactly ten concurrent requests should pass");
  } finally {
    try {
      if (createdUserIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
});


test("PostgreSQL deletion tombstones prevent stale account records from being restored", { skip: !enabled }, async () => {
  const suffix = randomUUID();
  let userId;
  try {
    const user = await prisma.user.create({
      data: { name: "Tombstone Test", email: "tombstone-" + suffix + "@example.test", passwordHash: "test-only-hash" },
      select: { id: true }
    });
    userId = user.id;
    const key = { userId_kind_recordId: { userId, kind: "study-sessions", recordId: "session-" + suffix } };
    await prisma.userDataRecord.create({ data: { userId, kind: "study-sessions", recordId: key.userId_kind_recordId.recordId, data: { title: "Physics" } } });
    await prisma.userDataRecord.updateMany({ where: { userId, kind: "study-sessions", recordId: key.userId_kind_recordId.recordId, deletedAt: null }, data: { deletedAt: new Date() } });
    const active = await prisma.userDataRecord.findMany({ where: { userId, kind: "study-sessions", deletedAt: null } });
    const deleted = await prisma.userDataRecord.findMany({ where: { userId, kind: "study-sessions", deletedAt: { not: null } }, select: { recordId: true } });
    assert.equal(active.length, 0);
    assert.deepEqual(deleted.map(item => item.recordId), [key.userId_kind_recordId.recordId]);
    await prisma.userDataRecord.upsert({ where: key, create: { userId, kind: "study-sessions", recordId: key.userId_kind_recordId.recordId, data: { title: "Updated Physics" } }, update: { data: { title: "Updated Physics" }, deletedAt: null } });
    const restored = await prisma.userDataRecord.findUnique({ where: key });
    assert.equal(restored.deletedAt, null, "an explicit new save can restore the record");
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  }
});

test("PostgreSQL row locking preserves simultaneous answers to different quiz questions", { skip: !enabled }, async () => {
  const suffix = randomUUID();
  let userId;
  try {
    const user = await prisma.user.create({
      data: { name: "Quiz Concurrency Test", email: "quiz-lock-" + suffix + "@example.test", passwordHash: "test-only-hash" },
      select: { id: true }
    });
    userId = user.id;
    const attempt = await prisma.aiQuizAttempt.create({
      data: {
        userId,
        title: "Concurrency test",
        questionData: { questions: [
          { id: "q1", options: [{ id: "A" }], correctAnswer: "A" },
          { id: "q2", options: [{ id: "B" }], correctAnswer: "B" }
        ] }
      },
      select: { id: true }
    });
    const saveAnswer = (questionId, optionId) => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ai_quiz_attempts" WHERE "id" = ${attempt.id} AND "user_id" = ${userId} FOR UPDATE`;
      const current = await tx.aiQuizAttempt.findFirst({ where: { id: attempt.id, userId } });
      const answers = Array.isArray(current.submittedAnswers) ? current.submittedAnswers : [];
      await tx.aiQuizAttempt.update({ where: { id: attempt.id }, data: { submittedAnswers: [...answers, { questionId, optionId }] } });
    });
    await Promise.all([saveAnswer("q1", "A"), saveAnswer("q2", "B")]);
    const saved = await prisma.aiQuizAttempt.findUnique({ where: { id: attempt.id } });
    assert.deepEqual(saved.submittedAnswers.map(answer => answer.questionId).sort(), ["q1", "q2"]);
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  }
});
