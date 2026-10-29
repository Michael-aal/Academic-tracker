# Academic Tracker Security

## Security controls in the application

- Passwords are hashed with bcrypt; plaintext passwords are never stored.
- Password input is capped at bcrypt's 72-byte UTF-8 limit.
- Login errors do not reveal whether an email address exists.
- Login performs a bcrypt comparison even when an account is not found.
- API responses are marked private and non-cacheable to reduce exposure of student records on shared devices and intermediary caches.
- Authentication tokens expire after 24 hours.
- Authenticated student data routes must scope reads and writes to the verified account ID.
- AI requests send only the education track and a limited list of course codes/titles/credit units as saved profile context. Names, email addresses, institution, programme, and stored marks/results are excluded from that profile context. Notes that a student explicitly submits to an AI feature are still sent to the configured external AI provider.
- Admin routes must enforce the database role on the server; frontend visibility is not authorization.
- Payment webhooks must verify the provider signature against the raw request body.

## Required production configuration checks

These checks require access to the hosting and database accounts and cannot be proven from repository source alone.

### Render API

- Set `NODE_ENV=production`.
- Set a unique, randomly generated `JWT_SECRET` with at least 32 characters. Never reuse it across applications.
- Keep `DATABASE_URL`, `OPENROUTER_API_KEY`, `PAYSTACK_SECRET_KEY`, and any bootstrap/encryption secrets in Render environment variables only.
- Rotate any credential that has ever been committed, pasted into chat, or exposed in logs.
- Restrict deploy and environment-variable access to trusted maintainers; enable MFA on the hosting account.
- Review logs for accidental request-body, token, password, or provider-secret logging.

### Neon PostgreSQL

- Use a dedicated application database role with only the permissions required by the application; do not use an owner/superuser role for routine app traffic.
- Require TLS for database connections and use Neon pooled connections where appropriate for the Render workload.
- Confirm automated backups/restore points and test a restore procedure.
- Restrict Neon project access and enable MFA for maintainers.
- Never expose the database URL or credentials to frontend code.

### Vercel frontend

- Serve only over HTTPS and restrict project/deployment access.
- Keep private API keys out of `NEXT_PUBLIC_*`, `VITE_*`, HTML, and browser JavaScript.
- Review preview deployment access and remove obsolete deployments.
- Ensure the frontend's configured API origin is the intended production Render API.

## Remaining hardening work

- Replace browser-readable bearer tokens in localStorage with a server-managed HttpOnly, Secure, SameSite cookie session and CSRF protection. This requires coordinated frontend/API migration; do not enable cookie-only auth until every API client is migrated and tested.
- Add account recovery and session revocation/refresh-token rotation.
- Add automated cross-account authorization tests for every user-owned resource, including courses, results, quizzes, support conversations, subscriptions, and purchases.
- Add dependency vulnerability scanning and periodic penetration testing.
- Publish a clear student privacy notice and retention/deletion policy explaining that text/notes explicitly submitted to AI features are processed by the configured third-party AI provider.

## Verification boundary

Passing source checks does not prove production security. Render environment settings, Neon permissions/backups, Vercel deployment controls, TLS, and real two-account authorization tests must be checked in their respective environments before describing the service as fully security-verified.
