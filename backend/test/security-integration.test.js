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
    await assert.rejects(() => prisma.universityCourseResult.create({
      data: { userId: other.id, courseId: course.id, academicYear: "2027-2028", semester: "Semester 1" }
    }));

    const quotaResults = await Promise.all(Array.from({ length: 15 }, () => consumeAiQuota(prisma, owner.id)));
    assert.equal(quotaResults.filter(Boolean).length, 10, "exactly ten concurrent requests should pass");
  } finally {
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  }
});
