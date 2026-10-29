# Academic Tracker API

Express + Prisma + PostgreSQL API for personal Academic Tracker accounts. This service is designed to deploy on Render and use Neon PostgreSQL.

## Current API

- `GET /` — basic service response.
- `GET /api/health` — checks database connectivity.
- `POST /api/auth/register` — creates a personal account.
- `POST /api/auth/login` — returns a short-format bearer JWT (7-day expiry).
- `GET /api/auth/me` — returns the signed-in user's profile.
- `PATCH /api/auth/me` — updates name/current academic period.
- `GET /api/subjects` — lists only the signed-in user's subjects and the score for the selected/current period.
- `POST /api/subjects` — creates a subject for the signed-in user.
- `PATCH /api/subjects/:id` — renames or updates the target of an owned subject.
- `DELETE /api/subjects/:id` — deletes an owned subject and its scores.
- `GET /api/scores` — lists the signed-in user's scores for a period.
- `PUT /api/scores/:subjectId` — creates or updates the score record for an owned subject and period.

Authenticated endpoints require `Authorization: Bearer <token>`. The frontend must not send or select a user ID to determine ownership; the server derives it from the verified token.

## Data ownership and constraints

- Emails are unique and normalized to lowercase before registration/login.
- Subject names are unique per user (case-insensitive normalization in the API).
- Scores are unique for each subject + academic year + term.
- A composite foreign key ensures a score's `subjectId` and `userId` belong together.
- Database checks constrain target percentages, score maximums, marks, and terms.
- User deletion cascades to their subjects and scores; deleting a subject cascades to its scores.
- Passwords are hashed with bcrypt; plaintext passwords are never stored.

## Local development

Requirements: Node.js 20+ and a PostgreSQL database.

1. Copy `.env.example` to `.env`.
2. Fill in `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters.
3. From the `backend` directory run:

```sh
npm install
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm start
```

For development schema changes, edit `prisma/schema.prisma` and generate a migration against a development database using `npx prisma migrate dev --name descriptive_change`. Commit both the schema and migration. Use `migrate deploy` in production; do not use `db push` for production deployments.

## Deploy to Render

Create a **Web Service** from this GitHub repository:

- **Root Directory:** `backend`
- **Runtime:** Node
- **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`

Add these environment variables in Render (never commit real values):

- `DATABASE_URL` — Neon PostgreSQL connection string. Use the pooled connection string for runtime if desired; Neon’s direct connection can be used for migrations if you configure a separate migration URL.
- `JWT_SECRET` — long random secret, at least 32 characters.
- `FRONTEND_ORIGIN` — comma-separated exact allowed origins, e.g. your production Vercel URL and any preview URL you intentionally allow.
- `NODE_ENV` — `production`.
- `ADMIN_EMAIL` — optional email reserved for the administrator account.
- `ADMIN_BOOTSTRAP_SECRET` — optional high-entropy secret (at least 32 characters) required by the administrator bootstrap endpoint.

For the simplest first deployment, use Neon's direct PostgreSQL connection string as `DATABASE_URL` so both Prisma Client and the migration command can connect. Keep the connection string private. We can add a separate direct migration URL later if you decide to use Neon's pooled URL for runtime traffic.

## Frontend/API integration status

Registration, login, profile loading, and profile updates use the API. However, the dashboard main academic state in `app.js` still reads and writes IndexedDB/localStorage; it does not yet use `/api/subjects` and `/api/scores` for cloud-backed academic records. As a result, subject and score records are still browser-local and do not reliably sync across devices. The current local state also uses one shared key rather than an account-specific namespace, so different accounts on the same browser may see the same academic state. Avoid using shared browsers for private academic records until this is corrected. Treat cross-device academic-record sync as **not yet implemented** until the dashboard persistence layer is migrated and existing local records have a tested, non-destructive import/sync path.


## AI learning (optional)

The AI learning routes are authenticated and use OpenRouter from the server; the provider key is never sent to the browser. To enable the student tutor, quiz generator, notes summarizer, and study planner, set these environment variables on the backend host:

- `OPENROUTER_API_KEY` — private OpenRouter API key. Never add this to frontend code or commit a real value.
- `OPENROUTER_MODEL` — optional model identifier; defaults to `openai/gpt-4o-mini`.
- `AI_SITE_URL` — optional site URL sent as provider metadata.

The `/api/ai` endpoint accepts `tutor`, `quiz`, `summarize`, and `study-plan` actions, limits supplied text to 12,000 characters, and allows 10 requests per account per 15 minutes. The admin-only `GET /api/ai/status` endpoint reports configuration status without exposing credentials. No new database tables or migrations are required. AI is disabled until the server-side key is configured.


## Subscriptions, AI limits, study packs and institutions

The monetization foundation adds:
- A seven-day Pro trial granted by the API during account registration. The trial expires back to Free without deleting academic records.
- Server-authoritative subscription status, plan listing, payment history, cancellation and daily AI usage endpoints under `/api/subscriptions`.
- Five successful AI requests per UTC day for Free accounts. Pro limits are currently configurable in `src/ai-quota.js` per tool. Quota reservation uses an atomic PostgreSQL upsert; failed AI provider/generation requests release the reservation.
- Paystack transaction initialization and server-side verification, signed raw-body webhook validation, idempotent event records, and study-pack purchase verification.
- One-time study-pack catalogue and account-owned purchase records under `/api/study-packs`.
- Institution licensing inquiry capture at `POST /api/institutions` and admin-only inquiry review at `GET /api/institutions`.

### Payment configuration before launch

Set these in the backend host only; never expose the secret key in browser code:
- `PAYSTACK_SECRET_KEY` — start with a test secret key.
- `PAYSTACK_PLAN_DAILY`, `PAYSTACK_PLAN_WEEKLY`, `PAYSTACK_PLAN_MONTHLY`, `PAYSTACK_PLAN_YEARLY` — plan codes created in the payment provider dashboard using USD and the intended recurring intervals.
- `SUBSCRIPTION_TOKEN_ENCRYPTION_KEY` — long random key used to encrypt the provider's per-subscription cancellation token at rest.

Do not enable live charges until the merchant account, plans, webhook URL (`/api/subscriptions/webhook`), callback URLs, refund policy, and cancellation behavior have been tested. Payment credentials and merchant onboarding must be handled by an appropriately authorized adult/business owner; do not share private keys in chat or commit them to GitHub.

The prices in the UI are the earlier indicative USD conversions: daily $0.52, weekly $2.97, monthly $14.86, yearly $37.14. Paystack's published USD transaction minimum is $2.00, so the daily plan is intentionally blocked from checkout at $0.52. Revise that price or choose a payment setup that can legally and reliably process that amount before selling the daily plan. Recurring plan codes must match the displayed amounts and currency exactly.

Study packs are currently starter revision frameworks, not official exam-board material. Institutional licensing is inquiry capture only; seat provisioning, staff dashboards, institution billing, referrals, sponsorship placements and paid report exports are not yet activated as transactional products. Do not advertise these as available until their delivery and billing paths are implemented and tested.

### Important data boundary

The subscription system does not migrate the main dashboard's browser-local IndexedDB records to cloud storage. Academic records remain untouched when a trial or Pro entitlement expires. Cross-device syncing is still a separate project and must not be implied by successful account sign-in or payment.
