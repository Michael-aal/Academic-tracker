# Academic Tracker API

Express + Prisma + PostgreSQL API for personal Academic Tracker accounts. This service is designed to deploy on Render and use Neon PostgreSQL.

## Current API

- `GET /` — basic service response.
- `GET /api/health` — checks database connectivity.
- `POST /api/auth/register` — creates a personal account.
- `POST /api/auth/login` — returns a short-format bearer JWT (7-day expiry).
- `GET /api/auth/me` — returns the signed-in user's profile.
- `PATCH /api/auth/me` — updates name/current academic period.
- `GET /api/subjects` — lists only the signed-in user's subjects and the score for the selected/current period, plus subject deletion markers for safe multi-device sync.
- `POST /api/subjects` — creates a subject for the signed-in user.
- `PATCH /api/subjects/:id` — renames or updates the target of an owned subject.
- `DELETE /api/subjects/:id` — deletes an owned subject and its scores.
- `GET /api/scores` — lists the signed-in user's scores for a period.
- `PUT /api/scores/:subjectId` — creates or updates the score record for an owned subject and period.
- `GET /api/user-data/:kind` — lists only the signed-in user's saved records for an approved category.
- `PUT /api/user-data/:kind/:recordId` — validates and upserts one user-owned saved record.
- `PUT /api/user-data/:kind/bulk` and `DELETE /api/user-data/:kind/bulk` — bounded, transactional batch sync for collections.
- `DELETE /api/user-data/:kind/:recordId` — deletes only the signed-in user's record.
- `POST /api/auth/logout` — revokes active bearer tokens for the account by incrementing its session version.
- `GET /api/account/export` — downloads the signed-in user's profile, subjects/scores, university results, quiz attempts, saved records, and support conversation.

Authenticated endpoints require `Authorization: Bearer <token>`. The frontend must not send or select a user ID to determine ownership; the server derives it from the verified token.

## Data ownership and constraints

- Emails are unique and normalized to lowercase before registration/login.
- Subject names are unique per user (case-insensitive normalization in the API).
- Scores are unique for each subject + academic year + term.
- Composite foreign keys ensure a score's `subjectId` and `userId` belong together, and a university result's `courseId` and `userId` belong together. This prevents cross-account academic relationships even if a future API handler accidentally omits an ownership check.
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

For the simplest first deployment, use Neon's direct PostgreSQL connection string as `DATABASE_URL` so both Prisma Client and the migration command can connect. Keep the connection string private. We can add a separate direct migration URL later if you decide to use Neon's pooled URL for runtime traffic. Production CORS defaults do not include localhost; configure only the exact production and intentionally used preview origins.

## Account data categories

The authenticated `user_data_records` table stores validated, per-user JSON records for secondary tracker state, saved video-library items, video watch history, study sessions, Memory Mastery cards and review totals, AI tutor conversations, generated note summaries, focus sessions, and theme preferences. Each record is uniquely scoped by `(user_id, kind, record_id)`, indexed by user/category, limited to approved categories and a 24 KB record payload, and deleted automatically when its owning account is deleted. Relational tables remain the source of truth for subject metadata, university courses/results, support messages, and AI quiz attempts. The current secondary tracker stores its configurable assessment definitions and marks in the account-scoped `secondary-tracker` record; the older fixed-column `AssessmentScore` table and `/api/scores` route are retained for compatibility and are not written by the current dashboard.

Every user-data route requires a verified bearer token and derives ownership from `req.userId`; the client cannot select another user's ID. Responses are marked `private, no-store`. The API applies per-account request limits and category-specific validation. Quota-changing single and batch writes lock the owning account row in a transaction, preventing concurrent requests from racing past per-category record limits.

## Session security

JWTs carry a session-version claim. Authenticated requests compare that claim with the account's current `session_version` in PostgreSQL. Explicit sign-out increments the version and invalidates existing tokens for that account. This currently revokes all devices for that account, not just the current browser. Tokens are still held by the static frontend in browser localStorage. This remains a material XSS-related risk: JavaScript executing on the frontend origin could read a bearer token. A secure HttpOnly-cookie migration requires routing API traffic through a same-origin frontend proxy; simply setting a cross-site cookie between the Vercel and Render domains is not a reliable fix because browsers may block third-party cookies. Do not treat this remaining risk as resolved.

## Production migration

Deploy schema changes with `npx prisma migrate deploy` using the Render build command documented above. Do not use `prisma db push` against production. The UI must not be considered fully synced until the database migration has run and the production API has passed authenticated read/write checks.


## AI learning (optional)

The AI learning routes are authenticated and use OpenRouter from the server; the provider key is never sent to the browser. To enable the student tutor, quiz generator, notes summarizer, and study planner, set these environment variables on the backend host:

- `OPENROUTER_API_KEY` — private OpenRouter API key. Never add this to frontend code or commit a real value.
- `OPENROUTER_MODEL` — optional model identifier; defaults to `openai/gpt-4o-mini`.
- `AI_SITE_URL` — optional site URL sent as provider metadata.

The `/api/ai` endpoint accepts `tutor`, `quiz`, `summarize`, `study-plan`, and `flashcards` actions, limits supplied text to 12,000 characters, and allows 10 requests per account in any rolling 15-minute window. Each request is recorded in PostgreSQL inside a transaction that locks the account row, so concurrent requests and multiple API instances share the same quota. Quota checks fail closed if PostgreSQL is unavailable, and usage events older than 48 hours are cleaned up opportunistically. The admin-only `GET /api/ai/status` endpoint reports configuration status without exposing credentials. The `ai_usage_events` migration must be deployed before this quota feature is enabled. AI is disabled until the server-side key is configured.


## Proxy and rate-limit configuration

In production, Express trusts exactly one reverse-proxy hop because the API is deployed behind Render's ingress. This allows IP-based rate limits to use the originating client address rather than grouping every visitor under the proxy address. Forwarded headers are not trusted in local development. The coarse IP limiter uses the built-in in-memory store and is intended as a single-instance safeguard; use a shared rate-limit store before horizontally scaling general API traffic. AI spend limits are PostgreSQL-backed and shared across instances.


## Social Media, chat and referrals

The Social Media feature is mounted internally at `/api/community` for backwards-compatible API routing. It stores social profiles separately from academic records and supports posts, likes/reactions, comments, student discovery, connection requests, study groups, video-interest signals, referral attribution, direct/group chat records, and one-to-one WebRTC call signalling. Stories are intentionally not part of this product.

The static frontend entry point is `/social-media.html` (legacy `/community.html` remains available). Public feed/profile discovery is read-only; posting, connecting, joining groups, messaging and referrals require authentication. Private direct chats and calls require accepted connections in the same education track. Cross-level study groups can be created explicitly and remain subject to moderation. Referral attribution is recorded as PENDING; account registration alone does not grant rewards.

### Optional media and call configuration

Set the following server-side Render variables to enable voice-note uploads and improve calling reliability:

- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — signed voice-note uploads. The API returns short-lived upload signatures only to conversation members.
- `TURN_URL`, `TURN_SHARED_SECRET` — TURN service URL and REST shared secret. The API derives one-hour per-user credentials; the permanent secret is never sent to browsers. STUN-only calling may fail on some mobile networks and restrictive NATs.
- `PUBLIC_APP_URL` — canonical public frontend origin used in referral links. If omitted, the API uses the browser request origin.

Cloudinary is not configured by this code change. Do not enable production voice notes until the media account, upload limits, retention policy and abuse handling are configured. WebRTC call signalling is persisted through authenticated API polling; a TURN service is strongly recommended before describing calling as reliable on all networks. One-to-one calls are implemented; group voice/video calls are not included yet. Social notification delivery, message reactions/edit/delete, full read receipts/typing presence, AI chat assistance, and a dedicated ML model are also follow-up work. The current video recommender is a deterministic hybrid ranking service using Best Subject, interests, saves and negative feedback; it is not a trained machine-learning model.

Run `npx prisma migrate deploy` on the backend after reviewing the new migration. Validate the Prisma schema and run backend tests before deployment. No production migration or external media/calling credentials are applied by a Git branch.


The administrator review interface is available at `/community-admin.html` for authorized ADMIN/DEVELOPER accounts. It supports report resolution, cross-level group approval and manual referral-point approval. Group invitations are handled from the Community Groups tab.
