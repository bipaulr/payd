# payD

**An AI finance clerk for small businesses. payD reads any bill, flags fakes and duplicates, and pays through PayPal after a human approves.**

- Hosted demo: `APP_URL` (add the Render URL here once deployed)
- Demo video: `VIDEO_URL` (add the YouTube link here)
- Built for the PayPal AI Hackathon. Sandbox only. No real money moves.

## The problem

A small shop gets bills as PDFs, photos and email attachments. Someone has to read each one, type it into the books and pay it. Fake invoices exploit that routine: a known vendor's name, a new payment address and an urgent note. Duplicate bills get paid twice because nobody remembers the first one. payD is for the owner or bookkeeper of a business too small to have an accounts payable team. It does the reading and the checking, and leaves the decision to a person.

## Try it in 60 seconds

1. Open the hosted demo and click **Try the demo**, then **Load sample data**. Five invented vendors, 35 paid bills and five new bills appear.
2. Open the **Inbox**. Two bills are marked high risk and sorted to the top.
3. Open **Asha Traders**. It has a real vendor's name and logo, a new PayPal email, about four times the usual amount and an urgent note. Three flags explain it. Click **Reject**.
4. Open **Pinecrest Print Works**. Its invoice number was already paid last month. Click **Reject**.
5. Back in the Inbox, click **Pay all low-risk**, type a name, and confirm. PayPal Payouts pays the three genuine bills in the sandbox. Each card turns to Paid within about 20 seconds.
6. Open the **Ledger** to see all 40 bills with status, risk, PayPal batch ids, saved views and CSV export.

No login is needed. **Reset** on the Demo page clears everything.

## What it does

- **Reads bills.** Upload a PDF or image (up to 5 MB). A vision model extracts the vendor, PayPal email, invoice number, dates, line items, subtotal, tax, total and payment instructions, with a confidence for each field. Fields under 0.7 are highlighted for review.
- **Runs six risk checks** on every bill: duplicate, payee changed, unusual amount, math mismatch, lookalike vendor and pressure language. Each flag states its evidence in plain words.
- **Asks a human.** Nothing is paid without a recorded approval. A high-risk bill needs a typed override reason.
- **Pays with PayPal Payouts** and tracks the payment to its final status.
- **Keeps the books** in an AG Grid ledger with filters, saved views, inline category editing, totals and CSV export.
- **Shows its work.** Every bill has a timeline: uploaded, extracted, risk checked, approved, payout created, paid.

## How PayPal is used

All calls go to `api-m.sandbox.paypal.com`. A test fails the build if a live PayPal host appears anywhere in the code.

| API | Where | Why |
|---|---|---|
| OAuth 2 client credentials (`POST /v1/oauth2/token`) | `lib/paypal/token.ts` | Access token, cached until it expires |
| Payouts, create batch (`POST /v1/payments/payouts`) | `lib/paypal/payouts.ts`, `lib/bills/payBill.ts` | Pays one approved bill to the vendor's PayPal email |
| Payouts, get batch (`GET /v1/payments/payouts/{id}`) | `lib/paypal/payouts.ts`, `lib/bills/refresh.ts` | Tracks the payment when a webhook is late or missing |
| Webhook signature verification (`POST /v1/notifications/verify-webhook-signature`) | `lib/paypal/webhook.ts` | Every webhook is verified before it changes anything |
| Payout webhooks (`PAYMENT.PAYOUTS-ITEM.*`, `PAYMENT.PAYOUTSBATCH.*`) | `app/api/webhooks/paypal/route.ts`, `lib/bills/webhook.ts` | Marks bills paid or failed |

Payment safety rules, each covered by tests in `tests/paypal/`:

- **No approval, no payout.** `payBill()` refuses unless the bill is approved and the Approval row matches the bill's amount and payee.
- **A bill is paid once.** The `sender_batch_id` and `PayPal-Request-Id` are both `payd-<billId>`, so a retry is the same request to PayPal. The database also allows only one Payout per bill. Five parallel clicks create one payout.
- **Money is integer cents.** Floats never touch an amount.
- **Webhooks are verified, stored and deduplicated** by event id. A forged or replayed event changes nothing.

## How AI is used

| Model or tool | Where | Why |
|---|---|---|
| Google Gemini (free tier) through the Vercel AI SDK | `lib/extract/` | Reads the bill image or PDF into structured, validated fields with per-field confidence |
| Google Gemini | `lib/risk/checks/pressureLanguage.ts` | Finds urgency and "our details have changed" wording in payment instructions |
| Google Gemini | `lib/risk/assess.ts` | Writes a two-sentence summary of the flags for the owner |
| Claude Code | whole repository | Coding tool used to build payD |

The model never decides anything about money. Rules set the risk level and the model cannot lower it. If a model call fails, a keyword scan and a plain summary take over, so an outage can add a flag but never hide one. The model sits behind one small interface (`lib/extract/provider.ts`) and falls back to other Gemini models when one is overloaded or out of quota (`VISION_MODEL_FALLBACK`). Extraction results are cached by file hash.

## Architecture

```mermaid
flowchart LR
  U[Owner in the browser] -->|upload bill| API[Next.js API routes]
  API --> EX[extractBill<br/>Gemini vision]
  EX --> RISK[Risk engine<br/>six checks]
  RISK --> DB[(Postgres<br/>Prisma)]
  U -->|approve| APPROVE[recordApproval]
  APPROVE --> PAY[payBill<br/>one payout per bill]
  PAY -->|create payout| PP[PayPal Payouts<br/>sandbox]
  PP -->|signed webhook| WH[Webhook route<br/>verify, store, dedupe]
  WH --> DB
  PAY -. poll status .-> PP
  DB --> LEDGER[AG Grid ledger]
  LEDGER --> U
```

Bill states: `uploaded → extracted → needs_review → approved → paying → paid` (or `failed`, `rejected`). Every change goes through one function that updates only if the bill is still in the expected state. The full plan is in [docs/PLAN.md](docs/PLAN.md) and the reasoning behind each choice is in [docs/DECISIONS.md](docs/DECISIONS.md).

## Setup from a clean clone

Prerequisites: Node.js 22 or later, Docker (for the local database), a PayPal developer account and a Google AI Studio API key.

**PayPal sandbox accounts.** In the PayPal Developer dashboard create a REST app and confirm Payouts is enabled for it. Create one business account with a USD balance and one to three personal accounts. Note the personal account emails.

```bash
git clone https://github.com/bipaulr/payd.git
cd payd
npm install
cp .env.example .env
docker compose up -d
npm run db:generate
npm run db:deploy
npm run dev
```

Then open http://localhost:3000 and click **Try the demo**.

Fill in `.env` before `npm run db:deploy`:

| Variable | Value |
|---|---|
| `PAYPAL_ENV` | `sandbox` (anything else is refused) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app credentials |
| `PAYPAL_WEBHOOK_ID` | Webhook id from the dashboard. Optional locally; without it bills settle by polling |
| `PAYOUT_SMOKE_EMAIL` | A sandbox personal account email. Receives payouts for vendors with no mapped account |
| `DEMO_VENDOR_EMAIL_1..3` | Sandbox personal account emails for the three clean demo vendors. They may be the same account |
| `GEMINI_API_KEY` | Google AI Studio key (free tier) |
| `VISION_MODEL`, `VISION_MODEL_FALLBACK` | Gemini model ids. The defaults in `.env.example` work |
| `DATABASE_URL` | `postgresql://payd:payd@localhost:5433/payd?schema=public` for the Docker database |
| `APP_URL` | Public URL when deployed |

Notes:
- On Windows run the npm commands in PowerShell.
- If port 3000 is taken, use `npx next dev -p 3100`.
- PayPal cannot deliver webhooks to localhost. Locally, payD polls PayPal while a bill is paying and the bill page has a **Refresh from PayPal** button.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit and integration tests (Vitest). The payout and webhook tests use the database and a mocked PayPal |
| `npm run typecheck`, `npm run lint` | Type and lint checks |
| `npm run db:seed` | Development seed: 40 ledger rows. Deletes existing bills first |
| `npm run smoke:payout` | Sends a 1.00 USD sandbox payout and prints its status |
| `npm run eval:extract` | Runs extraction on the bills in `samples/` and prints per-field accuracy |
| `npm run demo:bills` | Regenerates the five demo bills in `samples/demo` |

Deploying to Render: see [docs/RENDER.md](docs/RENDER.md).

## Sponsor tools

- **PayPal**: Payouts, OAuth, webhooks (sandbox).
- **AG Grid Community**: the ledger (`components/LedgerGrid.tsx`).
- **Render**: web service and Postgres, defined in `render.yaml`.

## Sample data

Every vendor, person, address and email in this repository is invented. Emails on documents use the `.example` domain. The demo's 35 history bills are created directly in the database and are labelled as sample history; they were never sent to PayPal. The five new demo bills are real PDF files in `samples/demo`.

## Limitations

- Sandbox and USD only.
- No login and one shared workspace, so that judges can open the demo cold. A real product needs accounts and roles.
- In the sandbox, each payee is paid to a mapped test account. The confirmation dialog shows both the email on the bill and the account that is paid.
- A payout that PayPal fails is final in payD. The bill is not paid a second time.
- The free Gemini tier has tight quotas. When they run out, a new upload lands in review with a "try again" button. The demo itself uses cached extractions and needs no model call.
- The risk checks need history. A brand new vendor gets only the lookalike, math and pressure language checks.

## What comes next

- An "Ask payD" assistant that creates and sends PayPal invoices with the PayPal Agent Toolkit, and explains flags on request.
- Accounts, roles and a two-person approval rule for large bills.
- Reading bills straight from an email inbox.
- Scheduled payments on the due date.

## License

MIT. See [LICENSE](LICENSE).
