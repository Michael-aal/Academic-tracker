-- Initial Academic Tracker schema.
-- All academic records are owned by a user; the composite subject foreign key
-- prevents a score from referencing a subject belonging to another user.

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "current_academic_year" VARCHAR(30) NOT NULL DEFAULT '2026–2027',
    "current_term" VARCHAR(20) NOT NULL DEFAULT 'Term 1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(70) NOT NULL,
    "normalized_name" VARCHAR(70) NOT NULL,
    "target_percentage" INTEGER NOT NULL DEFAULT 75,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subjects_target_percentage_check" CHECK ("target_percentage" >= 0 AND "target_percentage" <= 100)
);

CREATE TABLE "assessment_scores" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "academic_year" VARCHAR(30) NOT NULL,
    "term" VARCHAR(20) NOT NULL,
    "ca1" DOUBLE PRECISION,
    "ca1_max" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "ca2" DOUBLE PRECISION,
    "ca2_max" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "ca3" DOUBLE PRECISION,
    "ca3_max" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "exam" DOUBLE PRECISION,
    "exam_max" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assessment_scores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_scores_maximums_check" CHECK (
      "ca1_max" > 0 AND "ca1_max" <= 100 AND
      "ca2_max" > 0 AND "ca2_max" <= 100 AND
      "ca3_max" > 0 AND "ca3_max" <= 100 AND
      "exam_max" > 0 AND "exam_max" <= 100
    ),
    CONSTRAINT "assessment_scores_marks_check" CHECK (
      ("ca1" IS NULL OR ("ca1" >= 0 AND "ca1" <= "ca1_max")) AND
      ("ca2" IS NULL OR ("ca2" >= 0 AND "ca2" <= "ca2_max")) AND
      ("ca3" IS NULL OR ("ca3" >= 0 AND "ca3" <= "ca3_max")) AND
      ("exam" IS NULL OR ("exam" >= 0 AND "exam" <= "exam_max"))
    ),
    CONSTRAINT "assessment_scores_term_check" CHECK ("term" IN ('Term 1', 'Term 2', 'Term 3'))
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "subjects_id_user_id_key" ON "subjects"("id", "user_id");
CREATE UNIQUE INDEX "subjects_user_id_normalized_name_key" ON "subjects"("user_id", "normalized_name");
CREATE INDEX "subjects_user_id_created_at_idx" ON "subjects"("user_id", "created_at");
CREATE UNIQUE INDEX "assessment_scores_subject_id_academic_year_term_key" ON "assessment_scores"("subject_id", "academic_year", "term");
CREATE INDEX "assessment_scores_user_id_academic_year_term_idx" ON "assessment_scores"("user_id", "academic_year", "term");

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_subject_id_user_id_fkey"
  FOREIGN KEY ("subject_id", "user_id") REFERENCES "subjects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
