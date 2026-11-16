CREATE TABLE "challenges" (
  "id" TEXT NOT NULL,
  "host_user_id" TEXT NOT NULL,
  "mode" VARCHAR(20) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "invite_code" VARCHAR(16) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'LOBBY',
  "questions" JSONB NOT NULL,
  "settings" JSONB,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "challenges_invite_code_key" ON "challenges"("invite_code");
CREATE INDEX "challenges_host_user_id_created_at_idx" ON "challenges"("host_user_id", "created_at");
CREATE INDEX "challenges_status_created_at_idx" ON "challenges"("status", "created_at");

CREATE TABLE "challenge_participants" (
  "id" TEXT NOT NULL,
  "challenge_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "team_key" VARCHAR(8),
  "role" VARCHAR(16) NOT NULL DEFAULT 'PLAYER',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "challenge_participants_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "challenge_participants_challenge_id_user_id_key" ON "challenge_participants"("challenge_id", "user_id");
CREATE INDEX "challenge_participants_challenge_id_team_key_joined_at_idx" ON "challenge_participants"("challenge_id", "team_key", "joined_at");
CREATE INDEX "challenge_participants_user_id_joined_at_idx" ON "challenge_participants"("user_id", "joined_at");

CREATE TABLE "challenge_answers" (
  "id" TEXT NOT NULL,
  "challenge_id" TEXT NOT NULL,
  "question_index" INTEGER NOT NULL,
  "competitor_key" VARCHAR(80) NOT NULL,
  "option_id" VARCHAR(80),
  "is_correct" BOOLEAN NOT NULL DEFAULT false,
  "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "challenge_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "challenge_answers_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "challenge_answers_challenge_id_question_index_competitor_key_key" ON "challenge_answers"("challenge_id", "question_index", "competitor_key");
CREATE INDEX "challenge_answers_challenge_id_competitor_key_idx" ON "challenge_answers"("challenge_id", "competitor_key");

CREATE TABLE "challenge_messages" (
  "id" TEXT NOT NULL,
  "challenge_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "team_key" VARCHAR(8),
  "body" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "challenge_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "challenge_messages_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "challenge_messages_challenge_id_team_key_created_at_idx" ON "challenge_messages"("challenge_id", "team_key", "created_at");
