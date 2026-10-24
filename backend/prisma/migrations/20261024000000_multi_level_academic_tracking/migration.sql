ALTER TABLE "users"
  ADD COLUMN "education_track" VARCHAR(20) NOT NULL DEFAULT 'SECONDARY',
  ADD COLUMN "institution_name" VARCHAR(160),
  ADD COLUMN "programme" VARCHAR(160),
  ADD COLUMN "study_level" VARCHAR(40),
  ADD COLUMN "current_semester" VARCHAR(20) NOT NULL DEFAULT 'Semester 1';

CREATE TABLE "university_courses" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "credit_units" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "university_courses_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "university_course_results" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "academic_year" VARCHAR(30) NOT NULL,
  "semester" VARCHAR(20) NOT NULL,
  "ca_score" DOUBLE PRECISION,
  "ca_max" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "exam_score" DOUBLE PRECISION,
  "exam_max" DOUBLE PRECISION NOT NULL DEFAULT 70,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "university_course_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "university_courses_user_id_code_key" ON "university_courses"("user_id", "code");
CREATE INDEX "university_courses_user_id_created_at_idx" ON "university_courses"("user_id", "created_at");
CREATE UNIQUE INDEX "university_course_results_course_id_academic_year_semester_key" ON "university_course_results"("course_id", "academic_year", "semester");
CREATE INDEX "university_course_results_user_id_academic_year_semester_idx" ON "university_course_results"("user_id", "academic_year", "semester");
ALTER TABLE "university_courses" ADD CONSTRAINT "university_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "university_course_results" ADD CONSTRAINT "university_course_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "university_course_results" ADD CONSTRAINT "university_course_results_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "university_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
