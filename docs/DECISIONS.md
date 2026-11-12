# Decisions

One line of reasoning each. Newest at the bottom.

## P0 (plan), 2026-11-11

- **sender_batch_id = `payd-<billId>`, PayPal-Request-Id = same value, sender_item_id = `bill-<billId>`.** Deterministic from the bill id, well under the 256 and 63 char limits, so every retry is the same request to PayPal.
- **Payout.billId and Payout.senderBatchId are unique in the database.** PayPal only blocks a reused sender_batch_id for 30 days; the database makes "a bill can be paid once" permanent.
- **A failed payout is terminal; payD never re-pays that bill.** A second attempt would need a new sender_batch_id, which breaks the one-payout-per-bill rule; the owner pays it outside payD.
- **A PayPal call that fails before a batch is accepted moves the bill paying -> approved with the error, and "Retry payment" resends the same ids.** PayPal docs say a 5xx retry with the same sender_batch_id pays only once, and P10 needs a retry path.
- **Webhook verification uses the postback API (`/v1/notifications/verify-webhook-signature`), not self-verification.** It is one documented call with no CRC32 and certificate handling to get wrong; the extra round trip is fine at our volume.
- **Simulator mock events are rejected.** They cannot be postback-verified and CLAUDE.md requires every webhook to verify; real sandbox payouts give real events.
- **Bill payee email and PayPal receiver email are stored separately (`payeeEmail` vs `receiverEmail`).** P8 needs `.example` emails on documents but real sandbox receivers; risk checks must compare document emails, not sandbox addresses.
- **In sandbox, a payee without a mapped sandbox account is paid to PAYOUT_SMOKE_EMAIL, shown openly in the confirm dialog.** Otherwise a judge's own uploaded bill would sit UNCLAIMED forever.
- **UNCLAIMED, PENDING and ONHOLD keep the bill in `paying`; only SUCCESS marks it paid.** Money has not reached the payee until PayPal says SUCCESS.
- **A REFUNDED item on a paid bill is logged, the bill stays `paid`.** The state machine in P0 has no refunded state, and scope is frozen.
- **Add a small ExtractionCache table beyond the nine listed models.** P8 requires caching extraction by file hash, and the cache must survive demo Reset.
- **Reset deletes all business tables but keeps WebhookEvent and ExtractionCache.** The hosted demo is shared, so a clean reset matters more than per-visitor data; webhook rows are an audit log with no foreign keys.
- **A proposed vendor becomes a Vendor only on a human action (confirm button or approval), logged in ActivityLog.** P3 forbids creating vendors silently.
- **The agent's "queue for approval" sets `Bill.queuedForApprovalAt`, not a new status.** Approval is a human act; the queue is only a highlight in the inbox.
- **Agent Toolkit: enable only invoices create, list, send, sendReminder with `context: { sandbox: true }`.** Least privilege; the toolkit has no payout tool and `payments` stays off so `pay_order` is never exposed.
- **send_invoice is wrapped to return a preview; the UI confirm button does the real send.** P7 requires one click to confirm before sending.
- **Invoice status on the Invoices page comes from `GET /v2/invoicing/invoices` plus INVOICING.INVOICE.* webhooks.** The toolkit README lists no `get` action key for invoices, and the list endpoint is documented.
- **Use the current AI SDK major, and adapt Agent Toolkit tools if their AI SDK 4 shape does not fit.** Extraction and risk (P3, P4) should not be pinned to an old SDK for the optional P7.
- **Keep GEMINI_API_KEY and pass it to the AI SDK Google provider explicitly.** The provider's default env var is GOOGLE_GENERATIVE_AI_API_KEY, but .env.example already uses GEMINI_API_KEY and names must not change.
- **The model returns amounts as decimal strings; lib/money parses them to integer cents with string math.** No floats touch money, per CLAUDE.md.
- **Rate limiting is an in-memory per-IP limiter.** One Render instance; no extra service needed for a hackathon demo.
- **Demo vendors with no sandbox mapping beyond three emails: the two non-clean demo vendors reuse sandbox receivers 1 and 2.** Only three DEMO_VENDOR_EMAIL slots exist and the duplicate and fake bills should not be paid anyway.
- **Local Postgres runs on host port 5433.** Port 5432 was already taken on this machine; DATABASE_URL in .env points at 5433.

- **Prisma pinned to 7.10.1 with @prisma/adapter-pg.** Latest npm tag was an 8.0 release candidate; stable matches @prisma/client 7.
- **Dependencies installed with PowerShell npm.** npm under Git Bash failed to spawn cmd.exe.
- **Extraction backoff retries on 429 and also 503.** In the P3 eval run, Gemini free tier returned 503 "high demand", which is as transient as a rate limit.
- **Low-confidence fields (under 0.7) or non-USD currency move a bill from extracted to needs_review right after extraction, listed in `extraction.flaggedFields`.** "Flagged for review" should be visible before the P4 risk engine exists; the transition is already in the state machine.
- **Vendor matching checks the printed payee email first, then the normalised name (lowercased, punctuation and Inc/LLC/Co suffixes removed).** An email is the stronger identity; a name match with a different email is left for the P4 payee_changed check.
- **The vision model gets a plain "wire" schema and payD validates with a stricter Zod schema (date, money and email formats).** Provider JSON-schema subsets vary; the strict errors are what the one retry sends back to the model.
- **Uploads are typed by magic bytes (PDF, PNG, JPEG, WEBP), not the browser's mime type.** The stored mimeType is later served back by /api/bills/[id]/file.

## P4 (risk engine), 2026-11-11

- **Risk model calls reuse `VisionProvider.generateJson` with `file` made optional.** P4 asks for the same provider interface as lib/extract; text-only calls simply omit the file.
- **Severities: duplicate, payee_changed and lookalike_vendor are high; amount_anomaly, math_mismatch and pressure_language are medium; level is the highest flag, low with none.** Paying the wrong account or paying twice loses money outright; the others usually have innocent explanations.
- **pressure_language falls back to a keyword scan if the model call fails.** A model outage may add a flag but must never hide one; the summary falls back to joined reasons as P4 says.
- **No model call for the summary when there are no flags.** A fixed sentence is enough and it saves free-tier quota.
- **payee_changed compares against payee emails of paid payouts; with none, against the vendor's email on file.** P3 left "name match, different email" to this check, and a vendor with no payouts still has a known address.
- **Duplicate and amount history ignore rejected bills; duplicate ignores the file hash entirely.** A rejected bill was never paid, and a re-scan has a new hash but is the same bill.
- **Unconfirmed vendors' history is other unconfirmed bills with the same normalised proposed name.** Otherwise a duplicate from a not-yet-confirmed vendor would slip through.
- **lookalike_vendor skips names or emails under 5 characters and only runs for new vendors (unconfirmed, or confirmed with no other bills).** Edit distance 2 makes almost any two short strings "similar".
- **Approval rules live in `approvalProblem()`; `recordApproval()` locks the bill and requires a risk level before approving.** A bill that was never assessed cannot have its high risk overridden by accident; the P5 route calls this.
- **Normalisers moved to `lib/bills/normalize.ts`.** The pure risk checks must not import the database client.

## P5 (review and pay screens), 2026-11-11

- **Approve and pay is one route (`POST /api/bills/[id]/approve`): recordApproval(), then payBill().** The Approval row is written first, so no payout exists without a recorded human approval; a failed PayPal call leaves the bill `approved` for "Retry payment".
- **The approve route rejects (409) if amount or payee email differ from what the confirmation showed.** The owner approves exactly what they saw.
- **Pay-all-low-risk re-checks every id server-side (needs_review and low risk) and skips the rest.** The client list is only a request.
- **Edits are limited to needs_review and re-run the risk engine; a confirmed vendor's name is not editable here.**
- **Ran the dev server with `VISION_MODEL=gemini-3.5-flash` in the shell instead of editing .env.** gemini-3.8-flash returned 503 "high demand" and extraction timed out; 3.5-flash worked.
- **The webhook route is not part of P5; "Refresh from PayPal" settles payouts here.**

## Takeover session, 2026-11-12

- **P2 was only half built (no webhook route, no tests); finished it directly instead of re-running run.sh.** logs/P2.log and P3.log were empty and run.sh trusts the exit code alone.
- **Webhook logic lives in `lib/bills/webhook.ts`; the route only calls it.** The handler is tested without a running server.
- **An unverified webhook is stored under a random `unverified:<uuid>` key, not its claimed event id.** Otherwise a forged delivery could occupy a real event id and make the real event look like a replay.
- **A stored event whose processing failed is processed again on redelivery; the route answers 500 so PayPal retries.** Applying a payout status is idempotent, so reprocessing is safe.
- **payBill and webhook tests run against the real Postgres with a mocked PayPal (global fetch), and skip when no database is reachable.** The double-pay guarantee is a row lock and unique keys; a mocked database would not prove it.
- **`VISION_MODEL_FALLBACK` (default `gemini-3.5-flash`) is tried when the main model returns 503 or 429 or times out, and a failed model is skipped for 3 minutes.** `gemini-3.8-flash` returned 503 "high demand" on both days; a demo cannot depend on one free-tier model.
- **P7 (agent) and P9 (polish) are cut.** Paul's instruction: only if everything else is verified with 3 hours left, which it is not.
- **Read routes refresh `paying` bills from PayPal, at most once per 8 seconds per bill.** The UI already polls every 3 seconds; without this a bill only settled on a webhook or a manual "Refresh from PayPal".
- **Approving a bill from a vendor not on file creates the Vendor in the same transaction, logged as `vendor_confirmed`.** P0 decided a vendor is created only on a human action; approval is that action, and later bills then get payee-changed and duplicate checks.
- **The confirm dialog shows the PayPal email on the bill and the sandbox account that is actually paid.** P5 asks for the exact PayPal email; in sandbox they differ.
- **Demo history is 35 paid bills created directly in the database with `SAMPLE-` batch ids and a "not sent to PayPal" timeline note.** Sending 35 real sandbox payouts on every load would be slow and rate limited; the label keeps it honest.
- **The five demo bills are real PDFs in samples/demo, extracted once with Gemini and stored as `*.extraction.json`; load seeds ExtractionCache from them.** The demo then needs no model call and loads in under a second.
- **Demo load runs the risk rules without the model, then re-runs the flagged bills with the model in the background.** The level comes from rules either way; the model only improves the wording, and a quota error cannot slow or break the load.
- **`npm run db:seed` is the demo loader (40 rows).** One code path for P6's seed and P8's demo.
- **Fallback chain is `gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.7-flash`; a 404 (retired model) also moves to the next.** On Nov 12 3.8-flash returned 503 and 3.5-flash hit its free-tier quota within about 25 calls.
- **Render build uses `npm ci --include=dev`.** Render sets NODE_ENV=production, which makes npm skip devDependencies, and the build needs TypeScript and Tailwind.
- **pdf-lib moved to dependencies.** The demo loader draws the history bills at runtime.
- **The Invoices page and nav item were removed.** They belong to the agent milestone (P7), which is cut; an empty page is a dead link.
- **Colours follow Paul's soft pastel rainbow palette (lavender accent; pink, peach, mint and sky for danger, warning, success and info), in light and dark.** His request on Nov 12.
- **Dev server on this machine: use `npx next dev -p 3100`.** Another app (Docker) holds IPv4 port 3000.
- **All screens redesigned with the Hallmark design skill (v2.0.0), at Paul's request on Nov 12.** Full depth: content and wiring kept (7/7 links, 31/31 handlers per its linter), system and composition changed. Its linter went from 16 Floor failures to 0.
- **Top bar instead of a sidebar.** Three destinations do not earn a sidebar, and the ledger and bill page get the width.
- **The pastel palette is the brand: ten flat swatches as a strip, never a gradient.** Hallmark refuses purple-to-blue gradients; flat blocks keep the palette and pass.
- **Bricolage Grotesque for heads, Figtree for body, loaded with next/font.** Self-hosted at build time, so no runtime font request.
- **Landing hero reworded to "Bills in. Fakes out." with a 12-word line, and the eyebrow removed.** Hallmark's hero budget; the hero now shows the real risk panel for the demo's fake bill.
- **Lists are flat rows with rules, not striped cards; labels are sentence case; the AG Grid theme reads the app's CSS tokens.** One system across screens, and dark mode follows without JavaScript.
