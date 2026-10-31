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

## 4. Central AI gateway and provider configuration

Every generated AI learning task is routed through `backend/src/ai-provider.js`. The browser never receives provider keys and cannot choose a provider or model.

Configure these server-side environment variables on Render:

- `AI_PROVIDER_ORDER=openrouter,xai`: ordered provider fallback chain. Only providers with keys are called.
- `OPENROUTER_API_KEY` and optional `OPENROUTER_MODEL`.
- `XAI_API_KEY` and optional `XAI_MODEL`. An xAI consumer chatbot account is not an API credential; obtain a developer API key separately.
- `AI_CREDIT_RATES_JSON`: internal credits per 1,000 input/output tokens, keyed by provider. Start with conservative values and calibrate against actual provider invoices before enabling paid usage.

The gateway supports OpenRouter and xAI's OpenAI-compatible chat-completions API. New providers should be added only in the server-side provider registry. Provider fallback is automatic for authentication, rate-limit, timeout, server, and connection failures. The same gateway is used for the quiz regeneration attempt; no AI route should call a provider URL directly.

The AI status endpoint is admin-only and reports configured provider names/models, never secrets. Provider order and model selection are controlled by Render environment configuration, not student input.

## 5. Credit behaviour

- Premium access and AI credits are separate.
- Credit lots retain their own expiry dates; the wallet consumes earliest-expiring credits first.
- Requests are validated before any credit reservation.
- Every AI generation request passes through the central backend credit gate. The browser cannot set a balance, cost, provider, or model.
- Premium accounts must have enough credits before a provider request is made. Free accounts without purchased credits continue using the existing request quota; purchased credit bundles are still consumed through the same gate.
- Successful requests settle against provider-reported input/output usage using the provider-specific internal rates; unused reserved credits are returned.
- Failed AI requests are refunded idempotently. Credit lots expiring during a request receive a fresh refund lot rather than losing the refund.
- The estimator is a reservation safeguard, not an invoice. Calibrate rates and maximum workload costs against real provider invoices before live launch.

## 6. API

- `GET /api/premium/catalog`: public package catalog and payment configuration status.
- `GET /api/premium/me`: authenticated Premium status, active credit lots, and recent transactions.
- `POST /api/premium/initialize`: authenticated Paystack checkout initialization.
- `POST /api/premium/verify`: authenticated transaction verification.
- `POST /api/premium/webhook`: Paystack server-to-server webhook.

The backend derives the account from the verified session. Client-supplied prices, balances, or credit quantities are never trusted.
