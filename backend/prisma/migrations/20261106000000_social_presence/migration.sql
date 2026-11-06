ALTER TABLE "community_profiles" ADD COLUMN "last_seen_at" TIMESTAMP(3);
CREATE INDEX "community_profiles_last_seen_at_idx" ON "community_profiles"("last_seen_at");
