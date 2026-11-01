"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Runs in CI after a clean PostgreSQL database has received every migration.
test("Social Media moderation status columns are present and queryable", {
  skip: process.env.RUN_DB_INTEGRATION !== "1"
}, async () => {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const columns = await prisma.$queryRawUnsafe("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'community_profiles' AND column_name = 'status') OR (table_name = 'study_groups' AND column_name = 'status'))");
    const present = new Set(columns.map(row => row.table_name + "." + row.column_name));
    assert.ok(present.has("community_profiles.status"), "community_profiles.status migration is missing");
    assert.ok(present.has("study_groups.status"), "study_groups.status migration is missing");

    // These also validate that the generated Prisma client knows both fields.
    await prisma.communityProfile.findMany({ select: { status: true }, take: 1 });
    await prisma.studyGroup.findMany({ select: { status: true }, take: 1 });
  } finally {
    await prisma.$disconnect();
  }
});
