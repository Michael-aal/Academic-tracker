-- Retain subject deletion markers so another device cannot recreate a deleted subject.
CREATE TABLE "subject_deletions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subject_deletions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subject_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "subject_deletions_user_id_subject_id_key" ON "subject_deletions"("user_id", "subject_id");
CREATE INDEX "subject_deletions_user_id_deleted_at_idx" ON "subject_deletions"("user_id", "deleted_at");
