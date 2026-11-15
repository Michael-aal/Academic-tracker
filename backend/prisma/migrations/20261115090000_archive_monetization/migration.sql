-- Preserve historical billing and wallet records outside the active application schema.
-- No student, academic, AI conversation, or social records are deleted.
ALTER TABLE IF EXISTS "premium_access" RENAME TO "legacy_premium_access";
ALTER TABLE IF EXISTS "credit_wallets" RENAME TO "legacy_credit_wallets";
ALTER TABLE IF EXISTS "credit_lots" RENAME TO "legacy_credit_lots";
ALTER TABLE IF EXISTS "credit_ledger" RENAME TO "legacy_credit_ledger";
ALTER TABLE IF EXISTS "payment_transactions" RENAME TO "legacy_payment_transactions";

-- Keep historical AI billing audit values, but remove the field from the active Prisma/API model.
ALTER TABLE "ai_usage_records"
  RENAME COLUMN "credits_charged" TO "legacy_credits_charged";
