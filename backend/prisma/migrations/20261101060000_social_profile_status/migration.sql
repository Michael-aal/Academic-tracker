-- Keep the social profile moderation state in sync with Prisma and API queries.
ALTER TABLE "community_profiles"
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX IF NOT EXISTS "community_profiles_status_created_at_idx"
  ON "community_profiles" ("status", "created_at");
