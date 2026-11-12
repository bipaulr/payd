# payD status

The memory for any future session. Do not trust `logs/*.done`; trust this file
and re-run the checks it names.

Last updated: Thu Nov 12 2026, 17:10 IST. Feature freeze 21:00 IST. Submit by
23:00 IST. Devpost closes Fri Nov 13 01:30 IST.

**Current state: P0 to P6, P8, P10, P11 are DONE and committed. P7 and P9 are cut.
The audit table below is the state at 16:10; the progress log is what changed since.**
## Audit (16:10 to 16:30 IST)

| Step | Status | Evidence | Missing |
|---|---|---|---|
| P0 plan | DONE | docs/PLAN.md, 294 lines, six sections | Links not re-checked today |
| P1 scaffold | DONE | typecheck 0, lint 0, tests 0 (51 pass); `prisma migrate status`: up to date | - |
| P2 PayPal core | PARTIAL | `npm run smoke:payout` exit 0, batch `JQR8V8VHAFAZ4`, item SUCCESS. lib/paypal and payBill exist | No `/api/webhooks/paypal` route (empty folder). No tests for double pay, missing approval, replayed webhook, bad signature. logs/P2.log is 0 bytes |
| P3 extraction | DONE with a fix needed | eval on 3 bills: 33/33 fields, 100%, with `gemini-3.5-flash` | `.env` model `gemini-3.8-flash` returns 503 "high demand" and the eval times out. Needs a model fallback. logs/P3.log is 0 bytes |
| P4 risk engine | DONE | 49 risk tests pass, pass and fail cases per check | Model summary never seen live |
| P5 review and pay | PARTIAL | Routes and screens exist; typecheck, lint, tests pass | No bill has ever reached `paid`. Confirm dialog does not show the sandbox receiver email |
| P6 ledger | NOT STARTED | Placeholder page | Everything |
| P7 agent (optional) | NOT STARTED | - | Everything |
| P8 demo mode | NOT STARTED | Banner exists in layout | Demo load, reset, sample bills, cache, rate limit, landing page |
| P9 polish (optional) | NOT STARTED | - | - |
| P10 final audit | NOT STARTED | - | - |
| P11 README, Devpost | NOT STARTED | README is a stub | - |

Other findings:
- BLOCKED.md (from P5 last night): the approve call was denied by the
  permission classifier. Not a product problem. Paul has now asked for the
  sandbox flow to be run, so this is cleared once P5 passes.
- Docker Desktop was not running. Started it; `docker compose up -d` brought
  Postgres up on 5433.
- `.env`: PAYPAL_WEBHOOK_ID and APP_URL are empty (need Render). Everything
  else required is set. `.env` is git-ignored and was never committed.
- Git: clean tree, 7 commits, remote `origin` set, nothing uncommitted.
- run.sh marks a step done on exit code 0 even with an empty log. Not used
  from here on; work is done directly.

## Progress log

(newest at the bottom)
- 16:25 IST. **P2 DONE.** Added `lib/bills/webhook.ts`, `app/api/webhooks/paypal/route.ts`, tests in `tests/paypal/` (double pay, missing approval, replayed webhook, bad signature, retry, duplicate batch link) and `tests/sandboxOnly.test.ts`. typecheck 0, lint 0, tests 0 (75 pass). Smoke payout batch `JQR8V8VHAFAZ4` SUCCESS. Not verified: a real webhook delivery (needs the Render URL and PAYPAL_WEBHOOK_ID).
- 16:25 IST. **P3 DONE.** Model fallback added (`VISION_MODEL_FALLBACK`). `npx tsx scripts/eval-extract.ts` with the `.env` default: 3.8-flash 503, fell back to 3.5-flash, 33/33 fields, 100% on 3 bills, 5 to 9 s each. Added `tests/extract.test.ts`.
- 16:35 IST. **P5 DONE.** Bill `cmwcelylv0000r8uhjoqi8lay` uploaded, approved by "Paul", paid: batch `X4YLABBVWA8FL`, item SUCCESS. Second approve and retry were refused (409). BLOCKED.md removed. Added auto-refresh while paying, receiver email in the confirm dialog, vendor confirmation on approval.
- 16:55 IST. **P6 DONE.** AG Grid Community 36.3 ledger (`components/LedgerGrid.tsx`): 10 columns, badge renderers, sort, filters, quick search, 4 saved views, inline category edit, pinned totals, row click, CSV export, column state in localStorage, light and dark. `npm run db:seed` gives 40 rows. Checked in the browser on a production build: grid renders, no console errors, category "Stationery" saved (PATCH 200) and was still there after reload.
- 16:55 IST. **P8 DONE (local).** `POST /api/demo/load` takes 0.65 s. Five outcomes from a fresh load: Brightleaf, Harborline, Greenfork clean and low risk, paid through `pay-low-risk` with real sandbox batches `N92XKER8A6QWJ`, `ESXXJMQJXCHFL`, `UAR4VKQ7ZK2H4` (all item SUCCESS, settled by polling in about 20 s); Pinecrest duplicate high (duplicate); Asha Traders fake high (payee_changed, amount_anomaly, pressure_language). Both rejected; approving the fake without an override reason was refused. Banner, landing page, rate limits (uploads 12/min, demo 6/min per IP) in place. Not verified: the hosted URL and a real webhook (need Render). Local demo settles by polling.
- Known: Gemini free tier. `gemini-3.8-flash` 503 all day, `gemini-3.5-flash` quota ran out about 16:40; `gemini-3.5-flash-lite` answers. The demo itself needs no model call. Live uploads depend on quota.
- Known: `.env` DEMO_VENDOR_EMAIL_1 and _3 look like the same sandbox account. Payouts still succeed.
- typecheck 0, lint 0, tests 0 (75 pass), `npm run build` 0.
- 17:05 IST. **P10 DONE, P11 DONE.** README.md and docs/DEVPOST.md written from the code.

## P10 audit report (also in logs/P10-report.md)

Final check: typecheck 0, lint 0, tests 0 (75 pass), production build 0.

| # | Issue found | Severity | Fixed |
|---|---|---|---|
| 1 | No `/api/webhooks/paypal` route existed (P2 never finished) | Critical | Yes |
| 2 | No tests for double pay, missing approval, replayed webhook, bad signature | High | Yes, `tests/paypal/` |
| 3 | A bill stayed `paying` forever without a webhook or a manual refresh | High | Yes, read routes refresh from PayPal |
| 4 | `VISION_MODEL` (gemini-3.8-flash) returned 503; uploads timed out | High | Yes, fallback chain and cool-down |
| 5 | Render build would skip devDependencies (TypeScript, Tailwind) under NODE_ENV=production | High | Yes, `npm ci --include=dev`. Not proven on Render |
| 6 | A forged webhook stored under its claimed id could block the real event | Medium | Yes, stored under a random key |
| 7 | Failed extraction could not be retried (same file returns the same bill) | Medium | Yes, "Try reading again" |
| 8 | A non-bill photo showed as "Low risk" | Medium | Yes, "No total was found" panel, approve disabled |
| 9 | Confirm dialog did not show the sandbox account actually paid | Medium | Yes |
| 10 | README was a stub | High | Yes |
| 11 | Empty Invoices page in the nav (agent milestone was cut) | Low | Yes, removed |
| 12 | Extraction cache was written but never read on upload | Medium | Yes |

What was tried and held:
- README followed in a fresh clone with an empty database: install, generate, migrate, typecheck, lint, 75 tests, build, dev server, demo load. All passed.
- Demo story from a clean reset, locally: 3 paid (batches N92XKER8A6QWJ, ESXXJMQJXCHFL, UAR4VKQ7ZK2H4), duplicate and fake high risk and rejected.
- Pay twice: 4 parallel approve calls plus pay-low-risk on one bill gave 1 Approval, 1 Payout, 1 PayPal batch; the rest got 409. Retry after paying: 409. Replayed webhook and retry after a PayPal 503: covered by tests.
- Pay without approval: retry-payment on an unapproved bill 409; payBill with no Approval row refuses (test); high risk without override 400; stale amount 409; approve after reject 409.
- Uploads: 6 MB file 413, empty file 400, exe renamed .pdf 415, corrupt PDF lands in review with the error and a retry button, non-bill photo lands in review as not payable, two files 400.
- Broken model: 503, quota and timeout all seen live; bill lands in review with a message. Broken PayPal: bill returns to approved with the error and "Retry payment" (test).
- Forged webhooks: 400, bill unchanged.
- Secrets: no value from `.env` appears in any tracked file or in git history; `.env` was never committed.
- Live endpoints: one host constant, sandbox; a test scans the source for live hosts.
- Rate limits: sixth demo call in a minute gets 429.

Could not verify:
- The hosted URL on Render (not deployed yet), including the Render build.
- A real PayPal webhook delivery and its signature check (needs a public URL and PAYPAL_WEBHOOK_ID). The handler is tested with mocked verification only.
- The model-written risk summary and pressure-language check live: Gemini quota was exhausted. Their fallbacks were seen live.
- A real photo of a paper bill (only generated PDFs and a synthetic image were used).
- Dark theme was checked on the ledger and inbox only.

## Left for Paul

1. Push to GitHub (`git push origin main`).
2. Render: New > Blueprint from the repo (docs/RENDER.md). Fill the secret env vars. Put the URL in APP_URL.
3. PayPal dashboard: add webhook APP_URL/api/webhooks/paypal with all Payouts events; put its id in PAYPAL_WEBHOOK_ID on Render; redeploy.
4. On the hosted site: Demo > Load sample data, pay one bill, check its timeline shows "PayPal webhook received".
5. Put APP_URL and the video link into README.md and docs/DEVPOST.md (search for APP_URL and VIDEO_URL).
6. Record the video (outline at the end of docs/DEVPOST.md), upload to YouTube as Public.
7. Submit on Devpost with the text from docs/DEVPOST.md.

Local fallback if Render is not ready: `npm run build` then `npx next start -p 3100`, open http://localhost:3100. Bills settle by polling.

- 17:45 IST. **Hallmark redesign of all screens (asked for by Paul).** Landing, demo, inbox, bill and ledger. Hallmark linter: before 16 FAIL and 2 REFLEX, after 0 and 0; kept 7/7 links and 31/31 handlers. typecheck 0, lint 0, tests 0 (75), build 0. Checked in the browser on a production build, light and dark, no console errors; pay-all dialog opens and closes. Not re-run after the redesign: the paid-in-sandbox story (markup and styles only changed, no logic). Hallmark's render tier and its fresh-context review were not run (no puppeteer here).
- 18:05 IST. **Homepage rebuilt in Hallmark's Dose theme.** Hallmark lint 0 FAIL, typecheck 0, lint 0, tests 0 (75), build 0. Seen in the browser in light mode: hero and the third band. Not seen: the first two bands, the ink band, and dark mode (screenshots timed out).
- 17:35 IST. Homepage organiser is interactive (`components/HomeOrganiser.tsx`): hovering, focusing or tapping a compartment or its tag swaps the label to that bill. Checked in the browser: Brightleaf shows a green paid stamp, Pinecrest shows the duplicate and a grey stopped stamp; no console errors.
- 22:05 IST. Demo video made: `video/payd-demo.mp4` (2:24, 1080p, text-to-speech narration, recorded from the local production build; git-ignored). Shows 3 bills paid in sandbox, duplicate and fake rejected. Earlier attempt failed with PayPal INSUFFICIENT_FUNDS; Paul topped up the sandbox business account.
- 22:20 IST. Fixed: nav links did nothing on the ledger page. The totals row set a new array on every grid update, which re-rendered the grid in a loop and starved navigation. Now it keeps the same array when nothing changed. Checked with a headless browser: ledger to Inbox, Demo and home all navigate.
- 22:25 IST. Render is live: https://payd-fa00.onrender.com. Health ok, database healthy, 40 bills loaded, 3 paid with real sandbox batches on the hosted site. Webhook delivery still not confirmed.
- 22:35 IST. Video uploaded: https://youtu.be/2s8wiRIxUpc. Links are in README.md and docs/DEVPOST.md. Left: push, Devpost form.
