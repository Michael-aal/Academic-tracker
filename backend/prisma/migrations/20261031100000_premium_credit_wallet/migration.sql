CREATE TABLE "premium_access" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "plan_key" VARCHAR(20) NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "premium_access_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "premium_access_user_id_key" ON "premium_access"("user_id");
CREATE INDEX "premium_access_expires_at_idx" ON "premium_access"("expires_at");
ALTER TABLE "premium_access" ADD CONSTRAINT "premium_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credit_wallets" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credit_wallets_user_id_key" ON "credit_wallets"("user_id");
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credit_lots" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "original_credits" INTEGER NOT NULL,
  "remaining_credits" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_lots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "credit_lots_user_id_expires_at_created_at_idx" ON "credit_lots"("user_id","expires_at","created_at");
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credit_ledger" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "reference" VARCHAR(120),
  "description" VARCHAR(240) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credit_ledger_reference_key" ON "credit_ledger"("reference");
CREATE INDEX "credit_ledger_user_id_created_at_idx" ON "credit_ledger"("user_id","created_at");
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_transactions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reference" VARCHAR(120) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "item_key" VARCHAR(40) NOT NULL,
  "amount_kobo" INTEGER NOT NULL,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "duration_days" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");
CREATE INDEX "payment_transactions_user_id_created_at_idx" ON "payment_transactions"("user_id","created_at");
CREATE INDEX "payment_transactions_status_created_at_idx" ON "payment_transactions"("status","created_at");
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_transactions" ADD COLUMN "credit_validity_days" INTEGER NOT NULL DEFAULT 30;
