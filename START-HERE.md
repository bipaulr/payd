# payD starter: do these 6 things, then run one command

Deadline: Friday Nov 13, 1:30 am IST. Aim to submit by Thursday midnight.

1. Create a public GitHub repo named `payd`, clone it, and unzip these files
   into it. Commit and push.
2. PayPal Developer dashboard (sandbox):
   - Create a REST app. Copy the client ID and secret.
   - Confirm Payouts is enabled in the app's features.
   - Create one business account (USD, with balance) and three personal
     accounts (USD). Note the three personal emails.
3. Get an API key for your vision model. Set a spending cap on it.
4. Copy `.env.example` to `.env` and fill it in. For DATABASE_URL either
   paste a hosted Postgres URL, or leave it empty and have Docker running
   (the scaffold will add a local Postgres container).
5. Run `claude update`. You need v2.1.284 or later.
6. Run:  bash run.sh

What happens next
- run.sh runs each prompt in prompts/ unattended, in order, and commits
  after each one. Logs go to logs/.
- If a step cannot continue it writes BLOCKED.md and the script stops.
  Fix the problem, delete BLOCKED.md, and run `bash run.sh` again. It
  resumes where it stopped.
- After P1 finishes, read docs/RENDER.md and connect the repo in Render.
  Put the Render URL in .env as APP_URL and create a PayPal webhook that
  points to APP_URL/api/webhooks/paypal. Put its id in PAYPAL_WEBHOOK_ID.
- Open the app yourself after P3 and after P8. Passing tests do not prove
  the product is right.

Still yours to do: record the video, upload to YouTube as Public, submit
on Devpost.

Optional steps (off by default): P7 agent, P9 polish.
Turn them on with:  RUN_OPTIONAL=1 bash run.sh
