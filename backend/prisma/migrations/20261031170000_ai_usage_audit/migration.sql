CREATE TABLE "ai_usage_records" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "request_id" VARCHAR(64) NOT NULL,
  "action" VARCHAR(30) NOT NULL,
  "provider" VARCHAR(30) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
  "reasoning_tokens" INTEGER NOT NULL DEFAULT 0,
  "credits_charged" INTEGER NOT NULL DEFAULT 0,
  "usage_known" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(24) NOT NULL,
  "provider_status" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_usage_records_user_id_created_at_idx" ON "ai_usage_records"("user_id", "created_at");
CREATE INDEX "ai_usage_records_provider_model_created_at_idx" ON "ai_usage_records"("provider", "model", "created_at");
CREATE INDEX "ai_usage_records_request_id_idx" ON "ai_usage_records"("request_id");
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
