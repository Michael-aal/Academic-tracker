ALTER TABLE "payment_transactions"
  ADD COLUMN "base_amount_usd_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "exchange_rate_ten_thousandths" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "exchange_rate_as_of" TIMESTAMP(3);
