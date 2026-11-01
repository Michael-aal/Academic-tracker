CREATE TABLE "admin_bootstrap_otps" (
  "email" VARCHAR(254) NOT NULL,
  "pin_hash" VARCHAR(100) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMP(3) NOT NULL,
  "send_window_started_at" TIMESTAMP(3) NOT NULL,
  "sends_in_window" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_bootstrap_otps_pkey" PRIMARY KEY ("email")
);
CREATE INDEX "admin_bootstrap_otps_expires_at_idx" ON "admin_bootstrap_otps"("expires_at");
