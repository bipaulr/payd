# payD status

The memory for any future session. Do not trust `logs/*.done`; trust this file
and re-run the checks it names.

Last updated: Thu Nov 12 2026, 16:30 IST. Feature freeze 21:00 IST. Submit by
23:00 IST. Devpost closes Fri Nov 13 01:30 IST.

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
