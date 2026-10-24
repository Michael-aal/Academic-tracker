CREATE TABLE "assessment_goals" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "academic_year" VARCHAR(30) NOT NULL,
  "term" VARCHAR(20) NOT NULL,
  "assessment_type" VARCHAR(20) NOT NULL,
  "target_score" DOUBLE PRECISION NOT NULL,
  "max_score" DOUBLE PRECISION NOT NULL,
  "actual_score" DOUBLE PRECISION,
  "assessment_date" DATE,
  "reflection_reason" VARCHAR(1000),
  "improvement_plan" VARCHAR(2000),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_goals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assessment_goals_subject_id_user_id_fkey" FOREIGN KEY ("subject_id", "user_id") REFERENCES "subjects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assessment_goals_subject_id_academic_year_term_assessment_type_key" ON "assessment_goals"("subject_id", "academic_year", "term", "assessment_type");
CREATE INDEX "assessment_goals_user_id_academic_year_term_idx" ON "assessment_goals"("user_id", "academic_year", "term");
CREATE INDEX "assessment_goals_user_id_assessment_date_idx" ON "assessment_goals"("user_id", "assessment_date");
