ALTER TABLE "challenges" ADD COLUMN "idempotency_key" VARCHAR(80);
CREATE UNIQUE INDEX "challenges_idempotency_key_key" ON "challenges"("idempotency_key");