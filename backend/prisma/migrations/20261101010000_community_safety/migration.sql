CREATE TABLE "community_blocks" (
  "id" TEXT NOT NULL, "blocker_id" TEXT NOT NULL, "blocked_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_blocks_not_self" CHECK ("blocker_id" <> "blocked_id")
);
CREATE UNIQUE INDEX "community_blocks_blocker_id_blocked_id_key" ON "community_blocks"("blocker_id","blocked_id");
CREATE INDEX "community_blocks_blocked_id_created_at_idx" ON "community_blocks"("blocked_id","created_at");

CREATE TABLE "community_reports" (
  "id" TEXT NOT NULL, "reporter_id" TEXT NOT NULL, "target_type" VARCHAR(20) NOT NULL,
  "target_id" VARCHAR(120) NOT NULL, "reason" VARCHAR(40) NOT NULL,
  "details" VARCHAR(1000), "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "reviewed_by" TEXT, "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "community_reports_status_created_at_idx" ON "community_reports"("status","created_at");
CREATE INDEX "community_reports_reporter_id_created_at_idx" ON "community_reports"("reporter_id","created_at");
CREATE INDEX "community_reports_target_type_target_id_idx" ON "community_reports"("target_type","target_id");
