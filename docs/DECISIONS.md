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
