-- Monetization foundation: subscriptions, auditable payments, daily AI quotas,
-- one-time study packs, institution leads and idempotent payment webhooks.
CREATE TABLE "user_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "plan_code" VARCHAR(30) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'TRIALING',
  "trial_started_at" TIMESTAMP(3),
  "trial_ends_at" TIMESTAMP(3),
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "provider_customer_code" VARCHAR(120),
  "provider_subscription_code" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "user_subscriptions_user_id_status_current_period_end_idx" ON "user_subscriptions"("user_id","status","current_period_end");
CREATE INDEX "user_subscriptions_trial_ends_at_idx" ON "user_subscriptions"("trial_ends_at");

CREATE TABLE "payment_transactions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reference" VARCHAR(120) NOT NULL,
  "provider" VARCHAR(30) NOT NULL DEFAULT 'paystack',
  "plan_code" VARCHAR(50) NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "checkout_url" VARCHAR(1000),
  "paid_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");
CREATE INDEX "payment_transactions_user_id_created_at_idx" ON "payment_transactions"("user_id","created_at");
CREATE INDEX "payment_transactions_status_created_at_idx" ON "payment_transactions"("status","created_at");

CREATE TABLE "webhook_events" (
  "id" TEXT NOT NULL,
  "provider" VARCHAR(30) NOT NULL,
  "event_id" VARCHAR(160) NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider","event_id");

CREATE TABLE "ai_usage_daily" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "usage_date" DATE NOT NULL,
  "total" INTEGER NOT NULL DEFAULT 0,
  "tool_counts" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ai_usage_daily_user_id_usage_date_key" ON "ai_usage_daily"("user_id","usage_date");
CREATE INDEX "ai_usage_daily_usage_date_idx" ON "ai_usage_daily"("usage_date");

CREATE TABLE "study_packs" (
  "id" TEXT NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "education_track" VARCHAR(20) NOT NULL DEFAULT 'BOTH',
  "price_usd_cents" INTEGER NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "content" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "study_packs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "study_packs_slug_key" ON "study_packs"("slug");
CREATE INDEX "study_packs_published_education_track_idx" ON "study_packs"("published","education_track");

CREATE TABLE "study_pack_purchases" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "pack_id" TEXT NOT NULL,
  "payment_reference" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "amount_minor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_pack_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "study_pack_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "study_pack_purchases_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "study_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "study_pack_purchases_payment_reference_key" ON "study_pack_purchases"("payment_reference");
CREATE UNIQUE INDEX "study_pack_purchases_user_id_pack_id_key" ON "study_pack_purchases"("user_id","pack_id");
CREATE INDEX "study_pack_purchases_user_id_status_idx" ON "study_pack_purchases"("user_id","status");

CREATE TABLE "institution_licenses" (
  "id" TEXT NOT NULL,
  "institution_name" VARCHAR(180) NOT NULL,
  "contact_name" VARCHAR(120) NOT NULL,
  "contact_email" VARCHAR(254) NOT NULL,
  "seat_count" INTEGER NOT NULL DEFAULT 25,
  "status" VARCHAR(20) NOT NULL DEFAULT 'LEAD',
  "notes" VARCHAR(2000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "institution_licenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "institution_licenses_status_created_at_idx" ON "institution_licenses"("status","created_at");

-- Starter content is intentionally revision-oriented, not a promise of official exam-board endorsement.
INSERT INTO "study_packs" ("id","slug","title","description","education_track","price_usd_cents","published","content","updated_at") VALUES
('pack_secondary_revision','secondary-revision-starter','Secondary School Revision Starter','A structured revision checklist and practice framework for secondary-school subjects.','SECONDARY',199,true,'{"sections":[{"title":"Plan your revision","items":["List the topics your teacher has covered","Mark each topic as confident, practising, or needs help","Schedule short review sessions across the week"]},{"title":"Active recall","items":["Close your notes and explain the idea in your own words","Write key definitions or formulas from memory","Check your answer against your class notes"]},{"title":"Exam practice","items":["Attempt past-paper questions only when you have the right paper and marking guide","Review mistakes and note the concept to revisit","Ask a teacher when the marking scheme is unclear"]}]}'::jsonb,CURRENT_TIMESTAMP),
('pack_university_revision','university-study-systems','University Study Systems','A practical system for lecture review, course planning, and exam preparation.','HIGHER',299,true,'{"sections":[{"title":"Weekly course review","items":["Review lecture notes within a day where possible","Write a short summary for each lecture","Record questions to raise in class or office hours"]},{"title":"Course workload","items":["List courses and assessment dates","Break assignments into smaller milestones","Protect time for sleep and regular breaks"]},{"title":"Exam preparation","items":["Use active recall before rereading","Practise representative problems","Review errors and revisit the underlying concept"]}]}'::jsonb,CURRENT_TIMESTAMP),
('pack_jamb_revision','jamb-preparation-planner','JAMB Preparation Planner','A planning pack for organising JAMB revision topics and practice sessions.','SECONDARY',199,true,'{"sections":[{"title":"Set up","items":["List your selected subjects","Gather the current official syllabus and approved materials","Create a weekly topic checklist"]},{"title":"Practice cycle","items":["Study one topic at a time","Attempt timed practice questions from trusted materials","Record the reason for each mistake and revisit it"]},{"title":"Final review","items":["Prioritise weak topics without abandoning strong ones","Check exam-day requirements using official sources","Keep a sustainable sleep and study routine"]}]}'::jsonb,CURRENT_TIMESTAMP);
