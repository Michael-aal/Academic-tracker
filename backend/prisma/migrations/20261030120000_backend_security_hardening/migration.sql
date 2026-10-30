-- Enforce that a university result and its course always belong to the same account.
CREATE UNIQUE INDEX "university_courses_id_user_id_key" ON "university_courses"("id", "user_id");
ALTER TABLE "university_course_results" DROP CONSTRAINT "university_course_results_course_id_fkey";
ALTER TABLE "university_course_results" ADD CONSTRAINT "university_course_results_course_id_user_id_fkey" FOREIGN KEY ("course_id", "user_id") REFERENCES "university_courses"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Shared, database-backed AI quotas use individual timestamps for a true rolling window.
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ai_usage_events_user_id_created_at_idx" ON "ai_usage_events"("user_id", "created_at");
CREATE INDEX "ai_usage_events_created_at_idx" ON "ai_usage_events"("created_at");
