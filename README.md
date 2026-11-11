# payD

AI finance clerk for small businesses. Reads any bill, flags fakes and
duplicates, and pays through PayPal (sandbox) after a human approves.

## Setup
1. `cp .env.example .env` and fill it in. Leave `DATABASE_URL` empty to use the Docker Postgres below.
2. `docker compose up -d` (Postgres on host port 5433), then set
   `DATABASE_URL=postgresql://payd:payd@localhost:5433/payd?schema=public`.
3. `npm install`
4. `npm run db:deploy`
5. `npm run dev`, open http://localhost:3000, check /api/health.

Deploying: see docs/RENDER.md. Sandbox only; no real money moves.
