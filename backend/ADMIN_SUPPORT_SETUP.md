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
5. Open `https://academic-tracker-nu.vercel.app/admin-setup.html` (or your deployed frontend domain). Enter the existing account email/password and the `ADMIN_BOOTSTRAP_SECRET` value. The page signs in, calls the one-time promotion endpoint, and redirects to the admin inbox. The secret is entered only into the page and sent to the API over HTTPS. If you prefer manual setup, log in and use the JWT to call the endpoint below:

```sh
curl -X POST "https://academic-tracker-0b2q.onrender.com/api/auth/admin/bootstrap" \
  -H "Authorization: Bearer YOUR_ADMIN_ACCOUNT_JWT" \
  -H "X-Admin-Bootstrap-Secret: YOUR_ADMIN_BOOTSTRAP_SECRET"
```

The endpoint only promotes the signed-in account if its email matches the server-configured `ADMIN_EMAIL`. The secret is checked on the server. Do not share the JWT or bootstrap secret. After promotion, the admin can open `admin-support.html` from the dashboard's **Admin messages** shortcut.

#
## 3. Use a private environment-managed owner password

After the account has been promoted to `ADMIN`, you can switch its login password to a value managed by Render:

1. In Render → backend service → Environment, set `ADMIN_EMAIL=academictracker@gmail.com`.
2. Set `ADMIN_PASSWORD` to a new, unique password that you generate privately. Do not reuse a password shared in a chat.
3. Save the environment changes and redeploy the backend.
4. Sign in through the normal Study Track login page with the configured email and password. Successful login returns the normal signed JWT and the existing frontend routes the administrator to `admin-support.html`.

When the entered email matches `ADMIN_EMAIL`, the backend checks only `ADMIN_PASSWORD` and requires the matching database account to already have role `ADMIN`. A wrong password never falls back to the account's database password. If the environment password is missing, that administrator login is refused. Other users continue to authenticate with their own bcrypt-hashed database passwords.

Keep `ADMIN_PASSWORD` only in Render's private environment settings (or an ignored local `.env` file). Never add a real password to `.env.example`, frontend code, GitHub, screenshots, or support messages. Changing `ADMIN_PASSWORD` in Render and redeploying changes the administrator's login password without changing the database password hash.

## 4. User experience

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
