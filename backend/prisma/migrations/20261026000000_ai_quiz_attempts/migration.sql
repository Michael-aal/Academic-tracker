CREATE TABLE "ai_quiz_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "subject" VARCHAR(100) NOT NULL DEFAULT '',
    "topic" VARCHAR(160) NOT NULL DEFAULT '',
    "difficulty" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "question_data" JSONB NOT NULL,
    "submitted_answers" JSONB,
    "result_data" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_quiz_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ai_quiz_attempts_user_id_created_at_idx" ON "ai_quiz_attempts"("user_id", "created_at");
CREATE INDEX "ai_quiz_attempts_status_idx" ON "ai_quiz_attempts"("status");
