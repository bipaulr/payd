# payD plan

Upload a bill, extract it with a vision model, run six risk checks, get a
human decision, pay with PayPal Payouts (sandbox, USD), mark paid from a
verified webhook, show it all in an AG Grid ledger. One-click demo. Stretch:
"Ask payD" invoice agent on the PayPal Agent Toolkit. Scope is frozen here.

Invariants (from CLAUDE.md): sandbox only; money is integer cents; no payout
without a recorded human Approval; one payout per bill, enforced by a
deterministic `sender_batch_id` plus database unique keys; every webhook is
signature-verified before it changes anything; no login.

## 1. Data model (Prisma, Postgres)

Money is `Int` cents, currency the string `USD`, ids cuid, all tables have
`createdAt`/`updatedAt`. `?` means nullable.

- **Vendor**: `name`, `normalizedName` (indexed), `paypalEmail` (payee
  address on its documents), `sandboxReceiverEmail?` (sandbox account that
  receives payouts, section 5), `defaultCategory?`, `isDemo`.
- **Bill**: `vendorId?`, `proposedVendorName?`, `proposedVendorEmail?` (no
  silent vendor creation), `status` (section 2), `fileName`, `mimeType`,
  `fileBytes` (max 5 MB), `fileSha256` (unique), `invoiceNumber?`,
  `issueDate?`, `dueDate?`, `currency`, `subtotalCents?`, `taxCents?`,
  `totalCents?`, `payeeEmail?` (as printed), `paymentInstructions?`,
  `extraction` (Json: fields, per-field confidence, model), `rawModelOutput?`,
  `extractionError?`, `riskLevel?` (low | medium | high), `riskSummary?`,
  `category?`, `queuedForApprovalAt?` (agent), `paidAt?`, `isDemo`.
  Indexes: (vendorId, invoiceNumber), (vendorId, totalCents, issueDate).
- **BillLineItem**: `billId`, `position`, `description`, `quantity`
  (Decimal, not money), `unitPriceCents`, `amountCents`.
- **RiskFlag**: `billId`, `check` (duplicate | payee_changed | amount_anomaly
  | math_mismatch | lookalike_vendor | pressure_language), `severity`,
  `reason` (names the evidence), `evidence` (Json). Replaced on each run.
- **Approval**: `billId`, `decision` (approved | rejected), `actorName`,
  `reason?` (required for reject), `overrideReason?` (required when
  riskLevel is high), snapshot of `amountCents`, `payeeEmail`,
  `receiverEmail`, `riskLevel` at decision time.
- **Payout**: `billId` (unique), `approvalId` (unique, required FK: no
  Approval, no Payout row), `senderBatchId` (unique, `payd-<billId>`),
  `senderItemId` (`bill-<billId>`), `payoutBatchId?` (unique),
  `payoutItemId?`, `batchStatus?`, `itemStatus?` (PayPal
  `transaction_status`), `amountCents`, `currency`, `payeeEmail`,
  `receiverEmail`, `lastError?`, `lastResponse?` (Json), `lastCheckedAt?`.
- **WebhookEvent**: `paypalEventId` (unique, the event `id`), `eventType`,
  `resourceType?`, `verificationStatus`, `headers` (the five PAYPAL-*
  headers), `payload`, `processedAt?`, `error?`. No FKs; survives reset.
- **Invoice**: `paypalInvoiceId` (unique), `recipientName`,
  `recipientEmail`, `amountCents`, `currency`, `description`, `dueDate?`,
  `status` (PayPal invoice status), `raw` (Json), `createdBy` (agent | user).
- **ActivityLog**: `billId?`, `invoiceId?`, `actor` (user | system | agent |
  paypal), `action` (uploaded, extracted, flagged, approved, payout_created,
  webhook_received, queued, invoice_sent, ...), `detail` (Json).
- **ExtractionCache** (support table, P8): `sha256` (id), `model`, `result`.

## 2. Bill state machine

States: `uploaded, extracted, needs_review, approved, paying, paid, failed,
rejected`. All transitions go through one function, `transition(billId,
from, to)`, which does a conditional update (`WHERE id = ? AND status =
from`) and writes an ActivityLog row. Zero rows updated means someone else
won; the caller stops.

| From | To | Trigger |
|---|---|---|
| uploaded | extracted | extractBill() returned a valid object |
| uploaded | needs_review | extraction failed twice; raw output saved, owner types fields |
| extracted | needs_review | risk engine ran (always immediate) |
| needs_review | needs_review | owner edits a field; risk engine re-runs |
| needs_review | approved | human Approval(decision=approved) recorded; high risk needs overrideReason |
| needs_review | rejected | human Approval(decision=rejected) with a reason |
| uploaded | rejected | owner discards a bill that never extracted |
| approved | paying | payBill() created the Payout row in the same transaction |
| paying | approved | PayPal call failed before a batch was accepted (network, 5xx, 4xx); lastError shown, "Retry payment" resends with the same sender_batch_id |
| paying | paid | item `SUCCESS` (webhook PAYMENT.PAYOUTS-ITEM.SUCCEEDED or getPayout) |
| paying | failed | item FAILED, BLOCKED, CANCELED, RETURNED, or batch DENIED, CANCELED |

`paid`, `failed`, `rejected` are terminal. `paying` stays put while PayPal
reports batch PENDING or PROCESSING, or item PENDING, UNCLAIMED or ONHOLD;
the UI shows that sub-status. A `failed` bill is never re-paid in payD,
because PayPal rejects a reused `sender_batch_id` for 30 days and our unique
keys forbid a second Payout (see DECISIONS). A later REFUNDED on a paid
bill is logged in the timeline; the bill stays `paid`. Fields are editable
only in uploaded and needs_review.

payBill(billId) in one DB transaction: load the bill `FOR UPDATE`; refuse
unless status is `approved` and the latest Approval is `approved` with
matching amount and payee snapshot; upsert the Payout by `billId`;
transition approved to paying. Then, outside the transaction, call
createPayout. Double clicks, two tabs and retries all hit the same Payout
row and the same `sender_batch_id`.

## 3. Pages and API routes

Pages (App Router; a "Sandbox demo. No real money moves." banner on all):
- `/` landing: one-line pitch, "Try the demo" button to /demo.
- `/inbox` drag-and-drop upload; one card per bill (vendor, total, due
  date, status, risk badge), sorted by risk then due date; "Pay all
  low-risk" with one confirmation listing every bill.
- `/bills/[id]` document on the left; editable fields on the right with
  confidence under 0.7 highlighted; risk panel with each flag and reason;
  Approve and pay (dialog shows amount, payee email and the exact PayPal
  receiver email; typed override reason when high risk); Reject with
  reason; live status (poll every 3 s while paying); "Refresh from PayPal";
  activity timeline.
- `/ledger` AG Grid Community: one row per bill, status and risk renderers,
  sort, filters, quick filter, saved views (Needs review, Due this week,
  Paid this month, Flagged), inline category edit, pinned totals row, row
  click to bill, CSV export, column state in localStorage, light and dark.
- `/invoices` invoices created here with PayPal status (agent milestone).
- `/demo` "Load sample data" and "Reset".
- "Ask payD" command bar (Cmd/Ctrl+K) on every page (agent milestone).

API routes (all JSON, no auth, per-IP rate limit on uploads and agent):
- `GET /api/health` database status.
- `POST /api/bills` multipart upload (image or PDF, max 5 MB); same hash
  returns the existing bill. `GET /api/bills` list (inbox and ledger).
- `GET /api/bills/[id]` bill, line items, flags, payout, timeline.
- `PATCH /api/bills/[id]` edit fields or category; re-runs risk on fields.
- `GET /api/bills/[id]/file` original bytes with the stored mime type.
- `POST /api/bills/[id]/approve` record Approval, then payBill().
- `POST /api/bills/[id]/reject` record rejection with reason.
- `POST /api/bills/[id]/retry-payment` payBill() again for approved bills.
- `POST /api/bills/[id]/refresh` getPayout() and apply the status.
- `POST /api/bills/[id]/vendor` confirm the proposed vendor.
- `POST /api/bills/pay-low-risk` approve and pay a confirmed list of ids.
- `POST /api/webhooks/paypal` verify, store, dedupe, apply.
- `POST /api/agent` streamed agent chat (agent milestone).
- `GET /api/invoices`, `POST /api/invoices/[id]/send` (confirmed send).
- `POST /api/demo/load`, `POST /api/demo/reset`.

Code: `lib/money.ts` (cents to `"12.34"` and back, string math), `lib/paypal`,
`lib/extract`, `lib/risk`, `lib/bills` (transition, payBill, vendor match),
`lib/agent`, `lib/demo`, `lib/ratelimit.ts`.

## 4. PayPal calls

API host is always `api-m.sandbox.paypal.com` (one constant; a test asserts
the live host `api-m.paypal.com` appears nowhere in the code).

1. **OAuth token**: `POST /v1/oauth2/token`, HTTP Basic with
   `CLIENT_ID:CLIENT_SECRET`, `Content-Type:
   application/x-www-form-urlencoded`, body `grant_type=client_credentials`.
   Response has `access_token`, `token_type`, `expires_in` (seconds). Cache
   in memory until `expires_in` minus 60 s; on expiry request a new one.
   Doc: https://developer.paypal.com/api/rest/authentication/
2. **Create batch payout**: `POST /v1/payments/payouts`, Bearer token,
   header `PayPal-Request-Id: payd-<billId>` (keys stored 30 days; a retry
   returns the current state of the payout). Body:
   `sender_batch_header { sender_batch_id: "payd-<billId>", recipient_type:
   "EMAIL", email_subject, email_message }`, one item `{ recipient_type:
   "EMAIL", amount: { value: "<cents as string>", currency: "USD" },
   receiver: <receiverEmail>, sender_item_id: "bill-<billId>", note:
   "Invoice <number>" }`. Limits: sender_batch_id 256 chars, sender_item_id
   63, receiver 127. A sender_batch_id reused within 30 days is rejected
   with a HATEOAS link to the original payout, which we follow; a 5xx is
   safe to retry with the same id. Response 201 gives
   `batch_header.payout_batch_id` and `batch_status` (SUCCESS, PENDING,
   PROCESSING, DENIED, CANCELED). Rate limit 400 POST per minute.
   Docs: https://developer.paypal.com/docs/api/payments.payouts-batch/v1/ ,
   https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-post ,
   https://developer.paypal.com/docs/payouts/standard/integrate-api/ ,
   https://developer.paypal.com/api/payouts/customize
3. **Get payout batch**: `GET /v1/payments/payouts/{payout_batch_id}`
   (query `page`, `page_size`, `fields`, `total_required`). Returns
   `batch_header.batch_status` and `items[]` with `payout_item_id` and
   `transaction_status` (SUCCESS, FAILED, PENDING, UNCLAIMED, RETURNED,
   ONHOLD, BLOCKED, REFUNDED). Used by "Refresh from PayPal", the paying
   poll and the smoke script. Item detail if needed:
   `GET /v1/payments/payouts-item/{payout_item_id}`.
   Docs: https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-get ,
   https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-item-get ,
   https://developer.paypal.com/payouts/use-payouts/track-payout-item-status
4. **Verify webhook signature**: `POST /v1/notifications/verify-webhook-signature`
   with `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`,
   `transmission_time` (from headers PAYPAL-AUTH-ALGO, PAYPAL-CERT-URL,
   PAYPAL-TRANSMISSION-ID, PAYPAL-TRANSMISSION-SIG,
   PAYPAL-TRANSMISSION-TIME), `webhook_id` (PAYPAL_WEBHOOK_ID) and
   `webhook_event` (the parsed raw body). Accept only
   `verification_status == "SUCCESS"`; anything else is stored with the
   status and answered 400 without side effects. Missing headers or
   missing PAYPAL_WEBHOOK_ID: reject. Return 2xx fast after storing; PayPal
   retries a delivery up to 25 times over 3 days. Dedupe on the event `id`.
   Docs: https://developer.paypal.com/docs/api/webhooks/v1/ ,
   https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post ,
   https://developer.paypal.com/api/rest/webhooks/rest/
5. **Payout webhook events** (subscribe all on the sandbox app):
   `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.PROCESSING`,
   `PAYMENT.PAYOUTSBATCH.DENIED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`,
   `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.BLOCKED`,
   `PAYMENT.PAYOUTS-ITEM.CANCELED`, `PAYMENT.PAYOUTS-ITEM.HELD`,
   `PAYMENT.PAYOUTS-ITEM.REFUNDED`, `PAYMENT.PAYOUTS-ITEM.RETURNED`,
   `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`. Batch events carry no item data, so
   on a batch event we call getPayout. Item events carry the payout item
   (match Payout by `payout_batch_id`, then `sender_batch_id`). Invoice
   events for the Invoices page: `INVOICING.INVOICE.PAID`,
   `INVOICING.INVOICE.CANCELLED`, `INVOICING.INVOICE.UPDATED`. Confirm the
   resource shape against the first real sandbox event in P2.
   Docs: https://developer.paypal.com/api/rest/webhooks/event-names/ ,
   https://developer.paypal.com/docs/payouts/standard/reference/webhooks/
6. **Agent Toolkit invoice tools (Vercel AI SDK)**: package
   `@paypal/agent-toolkit` (v1.11.0, Node 18+), import
   `{ PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk'`, construct
   with `clientId`, `clientSecret`, `configuration: { actions: { invoices:
   { create: true, list: true, send: true, sendReminder: true } }, context:
   { sandbox: true } }`, pass `toolkit.getTools()` to the AI SDK. Tools
   used: `create_invoice`, `list_invoices`, `send_invoice`,
   `send_invoice_reminder`. No other action groups are enabled (the toolkit
   has no payout tool, and `payments` stays off so `pay_order` is never
   present). `send_invoice` is wrapped so the agent only produces a preview
   and the UI's confirm click calls `POST /api/invoices/[id]/send`.
   Invoice status for the Invoices page: `GET /v2/invoicing/invoices`
   (list); the toolkit maps to `POST /v2/invoicing/invoices`,
   `POST /v2/invoicing/invoices/{invoice_id}/send` and `/remind`.
   Docs: https://github.com/paypal/agent-toolkit ,
   https://github.com/paypal/agent-toolkit/blob/main/typescript/README.md ,
   https://developer.paypal.com/docs/api/invoicing/v2/ ,
   https://developer.paypal.com/docs/invoicing/

## 5. Sandbox gaps and fallbacks

1. **Webhooks need a public HTTPS listener on port 443.** Local dev gets no
   webhooks. Fallback: getPayout. The bill page polls every 3 s while
   paying and the server refreshes from PayPal at most every 10 s per bill;
   "Refresh from PayPal" forces it. The hosted Render URL gets real events.
   Doc: https://developer.paypal.com/api/rest/webhooks/rest/
2. **Simulator events cannot be postback-verified** (mock events belong to
   no app and use the webhook id `WEBHOOK_ID`). We do not accept them,
   because every webhook must verify. Fallback: test with real sandbox
   payouts (smoke script), and unit-test the handler with mocked
   verification and recorded payloads.
   Doc: https://developer.paypal.com/api/rest/webhooks/simulator/
3. **Receivers without a sandbox account stay UNCLAIMED** until claimed or
   returned. Fallback: each Payout has a `receiverEmail` separate from the
   bill's `payeeEmail`. Demo vendors map to DEMO_VENDOR_EMAIL_1..3 via
   `Vendor.sandboxReceiverEmail`; any other payee goes to
   PAYOUT_SMOKE_EMAIL. The confirmation dialog shows both addresses. Risk
   checks always use `payeeEmail`, so the demo's fake bill is still caught.
   Doc: https://developer.paypal.com/payouts/use-payouts/track-payout-item-status
4. **Batches may complete later** (PENDING or PROCESSING). Fallback: bill
   stays `paying` with the PayPal sub-status; poll and webhooks settle it.
5. **Payouts must be enabled and the sandbox business account funded.**
   P2's smoke script proves it. If refused: BLOCKED.md with the response,
   no workaround (per P2).
   Doc: https://developer.paypal.com/payouts/use-payouts/set-up
6. **Negative testing (PayPal-Mock-Response) does not list Payouts.**
   Fallback: Payouts test values, e.g. `items[0].note = "ERRPYO002"` gives
   SENDER_EMAIL_UNCONFIRMED and `GET /v1/payments/payouts/ERRPYOB004`
   gives DENIED, in an opt-in integration test only. Unit tests mock HTTP.
   Docs: https://developer.paypal.com/tools/sandbox/negative-testing/ ,
   https://developer.paypal.com/api/payouts/test-go-live
7. **Sandbox invoice emails**: the Invoicing docs do not say they are
   delivered. Fallback: the Invoices page shows status from the API, and
   the demo never depends on an inbox. Recipients are sandbox accounts.
8. **Agent Toolkit targets AI SDK 4** (`ai ^4.0.23`, `LanguageModelV1`,
   `maxSteps`); current AI SDK docs use `inputSchema` and `stopWhen`.
   Fallback: a small adapter that rewraps toolkit tools for the installed
   AI SDK; if that fails, our own four tools with the same names calling
   the Invoices v2 endpoints above. Package:
   https://raw.githubusercontent.com/paypal/agent-toolkit/main/typescript/package.json
9. **Hosted instance may sleep or restart.** Webhook retries (25 times over
   3 days) plus the getPayout fallback cover missed deliveries. The rate
   limiter is in memory, which is fine for one instance.
10. **Gemini free tier limits.** Cache extraction by SHA-256, retry 429 with
    backoff, and pre-extract the five demo bills from `samples/demo/*.json`
    so the demo never waits on the model.

## 6. Build order

Each milestone ends green (typecheck, lint, tests) and run by hand. [Prompt]

1. **Scaffold** [P1]: Next.js, TS strict, Tailwind, ESLint, Vitest; Prisma
   schema and first migration; Postgres; app shell; `/api/health`;
   render.yaml; README stub; docs/RENDER.md; CLAUDE.md commands.
2. **PayPal core** [P2]: lib/money, token, createPayout, getPayout,
   verifyWebhook, webhook route, transition(), payBill(), payout smoke
   script, tests for double pay, missing approval, replay, bad signature.
3. **Extraction** [P3]: upload route, hash dedupe, extractBill() behind a
   provider interface (Gemini), Zod schema, retry then needs_review,
   vendor matching, eval script, three sample bills.
4. **Risk engine** [P4]: six pure checks, assessBill(), model summary,
   high-risk override, pass and fail tests per check.
5. **Review and pay screens** [P5]: inbox, bill page, approve and pay,
   pay all low-risk, reject, polling, refresh, timeline; one bill to paid.
6. **Ledger** [P6]: the AG Grid page in section 3; dev seed of 40 rows.
7. **Agent** [P7, optional]: command bar, invoice tools plus our four
   tools, no payout tool, send confirm, Invoices page.
8. **Demo mode** [P8]: five vendors with history, five new bills (three
   clean, one duplicate, one fake), receiver mapping, extraction cache,
   banner, rate limit, landing page, Reset.
9. **Polish** [P9, optional]: one visual language, risk panel as hero,
   empty, loading and error states, 1280 px.

Then the final audit [P10] and the README and submission text [P11].
