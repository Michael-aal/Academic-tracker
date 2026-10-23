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

For the simplest first deployment, use Neon's direct PostgreSQL connection string as `DATABASE_URL` so both Prisma Client and the migration command can connect. Keep the connection string private. We can add a separate direct migration URL later if you decide to use Neon's pooled URL for runtime traffic.

## Important current limitation

This creates the backend and database schema; it does **not yet connect the existing browser UI to these endpoints**. The current frontend still reads/writes IndexedDB. The next stage is to add registration/login screens and replace local-only persistence for authenticated users with these API calls, while keeping the existing design and backup/import capability.
