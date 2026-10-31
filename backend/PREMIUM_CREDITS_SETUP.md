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
- `PAYSTACK_CALLBACK_URL`: `https://study-track-lilac.vercel.app/premium.html`
- `PREMIUM_CATALOG_JSON`: valid JSON containing approved USD base prices in **cents**, durations, credit grants, and credit validity.
- `USD_NGN_EXCHANGE_RATE`: server-controlled NGN per USD rate used for conversion at checkout.
- `USD_NGN_EXCHANGE_RATE_AS_OF` (optional): ISO date/time when the configured exchange rate was checked.

Configure the `plans` object with these exact USD prices and durations. Preserve your approved credit counts and expiry policy; the credit values below are not being changed by this code update:

| Plan key | `amountUsdCents` | Duration |
|---|---:|---:|
| `daily` | `50` | 1 day per unit; customers may select 1–6 days |
| `weekly` | `200` | 7 days |
| `monthly` | `799` | 30 days |
| `yearly` | `5500` | 365 days |

For the `daily` plan, the configured `credits` value is the per-day allowance. The backend multiplies both price and credits by the selected 1–6 days. Set this per-day credit allowance to the approved lower daily amount; it is intentionally not guessed here. Each credit bundle must also use an `amountUsdCents` base price. Keep the existing bundle credit counts and validity values unless you intentionally revise them.

All prices are defined in USD. The backend converts the USD-cent amount to NGN kobo using `USD_NGN_EXCHANGE_RATE`, saves the exact rate snapshot and converted kobo amount on the payment record, and sends only the saved NGN amount to Paystack. The customer's display toggle does not change the entitlement or server-calculated checkout amount. A later rate change cannot alter an already initialized transaction.

Paystack checkout remains NGN-only in this integration. A configured exchange rate is required before checkout is enabled. Never send a client-supplied amount, exchange rate, or credit count to Paystack. Configure test-mode credentials and complete successful, failed, cancelled, and duplicate-webhook tests before switching to live credentials.

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
- No AI credit-rate environment variable is required. AI requests use fixed action costs configured in `backend/src/ai-credit-gate.js`; provider token usage is recorded separately for cost monitoring.

The gateway supports OpenRouter and xAI's OpenAI-compatible chat-completions API. New providers should be added only in the server-side provider registry. Provider fallback is automatic for authentication, rate-limit, timeout, server, and connection failures. The same gateway is used for the quiz regeneration attempt; no AI route should call a provider URL directly.

The AI status endpoint is admin-only and reports configured provider names/models, never secrets. Provider order and model selection are controlled by Render environment configuration, not student input.

## 5. Credit behaviour

- Premium access and AI credits are separate.
- Credit lots retain their own expiry dates; the wallet consumes earliest-expiring credits first.
- Requests are validated before any credit reservation.
- Every AI generation request passes through the central backend credit gate. The browser cannot set a balance, cost, provider, or model.
- Every account must have enough unexpired wallet credits before any AI generation request is sent. There is no free-request quota bypass: zero or insufficient credits blocks AI Tutor, quiz generation/regeneration, note summaries, study plans, and flashcards at the API boundary.
- Free accounts receive **60 credits every 72 hours**. The first grant is created lazily when the account opens its wallet or makes its first AI request. A database row lock and ledger entry prevent duplicate refreshes across API instances.
- Free credits expire after 72 hours and do not roll over. Missed refresh periods do not accumulate; returning after a longer absence grants one fresh 60-credit allowance.
- Active Premium accounts do not receive the Free-plan refresh while their Premium access is active. Purchased credits remain in separate expiry-dated lots.
- Fixed costs per successful AI request: AI Tutor **2**, Quiz **3**, Notes Summary **2**, Study Plan **2**, and Flashcards **2** credits. The backend enforces these costs; client-supplied costs are ignored.
- Failed AI requests are refunded idempotently. Successful requests are charged the fixed action cost, regardless of provider fallback. Actual input/output token counts, provider, model, request correlation ID, and result status remain recorded separately for cost monitoring. Admins can inspect usage through `GET /api/ai/usage`; users can inspect their own records through `GET /api/ai/usage/me`.
- Credit lots expiring during a request receive a fresh refund lot rather than losing the refund.

## 6. API

- `GET /api/premium/catalog`: public package catalog and payment configuration status.
- `GET /api/premium/me`: authenticated Premium status, active credit lots, the Free refresh schedule, fixed AI action costs, and recent transactions.
- `POST /api/premium/initialize`: authenticated Paystack checkout initialization.
- `POST /api/premium/verify`: authenticated transaction verification.
- `POST /api/premium/webhook`: Paystack server-to-server webhook.

The backend derives the account from the verified session. Client-supplied prices, balances, or credit quantities are never trusted.
