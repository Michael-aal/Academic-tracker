# Private admin-to-user messaging setup

The support inbox gives each normal account exactly one private conversation. Admins can start a conversation with any user; users can only read and write to their own conversation. Authorization is checked against the database on each protected API request.

## 1. Deploy the schema migration

In the Render backend service, make sure the build command runs Prisma migrations after dependencies are installed and the client is generated:

```sh
npm ci && npx prisma generate && npx prisma migrate deploy
```

Keep the existing start command (normally `npm start`). Confirm `DATABASE_URL` points to the intended PostgreSQL database before deploying. The migration adds a default `USER` role to existing accounts and creates support tables.

## 2. Configure the administrator

1. Ensure the intended administrator already has an Academic Tracker account. If not, create that account before setting `ADMIN_EMAIL`.
2. In Render's Environment settings, set `ADMIN_EMAIL` to that account's exact email address (case-insensitive).
3. Set `ADMIN_BOOTSTRAP_SECRET` to a new, random secret with at least 32 characters. Keep it private; do not put it in frontend files, source control, or chat messages.
4. Redeploy the backend.
5. Log in to the existing administrator account and use its JWT to call the one-time promotion endpoint:

```sh
curl -X POST "https://academic-tracker-0b2q.onrender.com/api/auth/admin/bootstrap" \
  -H "Authorization: Bearer YOUR_ADMIN_ACCOUNT_JWT" \
  -H "X-Admin-Bootstrap-Secret: YOUR_ADMIN_BOOTSTRAP_SECRET"
```

The endpoint only promotes the signed-in account if its email matches the server-configured `ADMIN_EMAIL`. The secret is checked on the server. Do not share the JWT or bootstrap secret. After promotion, the admin can open `admin-support.html` from the dashboard's **Admin messages** shortcut.

## 3. User experience

- A regular account opens `support.html` from **Messages**.
- The administrator opens `admin-support.html`, searches users, and selects one user at a time.
- Conversations and messages are saved in PostgreSQL and remain available after signing out.
- Admins can mark a conversation Open, In progress, or Resolved.
- Messages are limited to 4,000 characters and the support API is rate-limited.

## Important operational notes

- Do not grant admin access by adding a role field to a registration request. New accounts are always created with role `USER`.
- If `ADMIN_EMAIL` is configured, public registration using that email is blocked.
- The migration and routes must be deployed before the UI can work against production.
- The current UI refreshes open conversations every 15 seconds; it is polling, not a WebSocket/live-push connection.
