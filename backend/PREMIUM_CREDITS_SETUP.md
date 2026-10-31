# Premium and AI credit setup

The Premium checkout is deliberately catalog-driven. Prices and credit quantities are not hard-coded into the frontend or payment endpoint.

## 1. Apply the database migration

Deploy the backend with the new Prisma schema and migration. Run:

```sh
npx prisma generate
npx prisma migrate deploy
```

The new tables store Premium access, credit wallets, expiry-dated credit lots, an append-only credit ledger, and Paystack payment transactions.

## 2. Configure Render environment variables

Set these on the Academic Tracker API service:

- `PAYSTACK_SECRET_KEY`: your Paystack secret key. Keep it on Render; never put it in frontend code or commit it.
- `PAYSTACK_CALLBACK_URL`: `https://academic-tracker-iota.vercel.app/premium.html`
- `PREMIUM_CATALOG_JSON`: valid JSON containing approved NGN prices in **kobo**, durations, credit grants, and credit validity.

Example structure (replace every zero with your approved values before enabling checkout):

```json
{
  "plans": {
    "daily":   { "name": "Daily Premium",   "amountKobo": 0, "durationDays": 1,   "credits": 100, "creditValidityDays": 30 },
    "weekly":  { "name": "Weekly Premium",  "amountKobo": 0, "durationDays": 7,   "credits": 500, "creditValidityDays": 30 },
    "monthly": { "name": "Monthly Premium", "amountKobo": 0, "durationDays": 30,  "credits": 1000, "creditValidityDays": 30 },
    "yearly":  { "name": "Yearly Premium",  "amountKobo": 0, "durationDays": 365, "credits": 0, "creditValidityDays": 30 }
  },
  "bundles": {
    "starter": { "name": "Starter", "amountKobo": 0, "credits": 100, "creditValidityDays": 7 },
    "plus":    { "name": "Plus",    "amountKobo": 0, "credits": 500, "creditValidityDays": 30 },
    "pro":     { "name": "Pro",     "amountKobo": 0, "credits": 1000, "creditValidityDays": 60 }
  }
}
```

For the daily plan, `amountKobo` and `credits` are per day; the student can choose one, two, or three days. Other plan amounts and credit grants are one-time for the selected period. A yearly plan with monthly credit allowances would need a separate scheduled grant policy; this version grants its configured credits at purchase time.

Paystack amount examples: NGN 500 = `50000` kobo. Checkout is disabled for catalog entries with zero or invalid prices. Configure test-mode credentials and test transactions before switching to live credentials.

## 3. Configure the Paystack webhook

In the Paystack dashboard, set the webhook URL to:

`https://academic-tracker-0b2q.onrender.com/api/premium/webhook`

The endpoint validates the `x-paystack-signature` against the raw request body, then independently verifies the transaction with Paystack before granting access or credits. The browser callback is not treated as proof of payment.

## 4. Credit behaviour

- Premium access and AI credits are separate.
- Credit lots retain their own expiry dates; the AI wallet consumes earliest-expiring credits first.
- Premium AI requests reserve an estimated amount before contacting the provider.
- Successful requests settle against OpenRouter-reported prompt/completion token usage; unused reserved credits are returned.
- Failed AI requests are refunded.
- Free accounts continue using the existing request quota.
- The current AI-credit estimator is an internal usage estimate, not a fixed provider-token conversion. Recalibrate it against actual provider invoices before live launch.

## 5. API

- `GET /api/premium/catalog`: public package catalog and payment configuration status.
- `GET /api/premium/me`: authenticated Premium status, active credit lots, and recent transactions.
- `POST /api/premium/initialize`: authenticated Paystack checkout initialization.
- `POST /api/premium/verify`: authenticated transaction verification.
- `POST /api/premium/webhook`: Paystack server-to-server webhook.

The backend derives the account from the verified session. Client-supplied prices, balances, or credit quantities are never trusted.
