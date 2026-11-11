# payD

AI finance clerk for small businesses. Reads any bill, flags fakes and
duplicates, and pays through PayPal after a human approves. Built solo for
the PayPal AI Hackathon. Hard deadline: Nov 12, 2026.

## Stack
- Next.js (App Router), TypeScript strict, Tailwind
- Postgres + Prisma
- PayPal sandbox: Payouts API, Invoicing via @paypal/agent-toolkit, Webhooks
- AI: vision extraction behind extractBill() using the Gemini free tier, agent via Vercel AI SDK (Gemini provider)
- AG Grid Community for the ledger
- Deployed on Render with render.yaml

## Rules
- Sandbox only. Never call PayPal live endpoints. Currency is USD.
- No payout without a recorded human approval. This includes the agent.
- Every payout uses an idempotent sender_batch_id derived from the bill id.
  A bill can be paid once.
- Store money as integer cents. Never floats.
- Verify every PayPal webhook signature before trusting it.
- Read the current PayPal and library docs before writing API calls. Do not
  write endpoints, fields or event names from memory.
- Secrets live in .env only. Never print or commit them. Keep .env.example
  current.
- Every feature must work in the hosted demo with no login.
- Scope is frozen to docs/PLAN.md. Do not add features outside it.

## Unattended runs
You are usually run headless by run.sh with nobody watching.
- Never wait for an answer. Make the most reasonable choice and record it in
  docs/DECISIONS.md with one line of reasoning.
- If you truly cannot continue (missing credential, PayPal feature disabled,
  no database), write BLOCKED.md at the repo root saying exactly what you
  saw and what the human must do. Then stop.
- When a prompt says "report", write the report to logs/<prompt>-report.md.
- Do not touch prompts/, run.sh, START-HERE.md or LICENSE.

## Commands
(fill in after the scaffold: dev, test, lint, typecheck, migrate, seed)

## Done means
- Typecheck, lint and tests pass
- You ran the flow yourself and saw it work
- README setup steps still work from a clean clone
