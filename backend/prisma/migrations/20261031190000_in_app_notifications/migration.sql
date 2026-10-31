CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_by_id" TEXT,
  "title" VARCHAR(120) NOT NULL,
  "body" VARCHAR(4000) NOT NULL,
  "category" VARCHAR(30) NOT NULL DEFAULT 'ANNOUNCEMENT',
  "metadata" JSONB,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");
CREATE INDEX "notifications_created_by_id_idx" ON "notifications"("created_by_id");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
