ALTER TABLE "study_groups" ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX "study_groups_status_created_at_idx" ON "study_groups"("status","created_at");
