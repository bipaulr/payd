# Deploying payD on Render

1. Push this repo to GitHub.
2. In the Render dashboard choose **New > Blueprint**, connect the GitHub repo
   and pick the branch. Render reads `render.yaml` and proposes one web
   service (`payd`) and one Postgres database (`payd-db`). Click **Apply**.
3. When prompted for the `sync: false` variables, fill them in (or set them
   later under the web service's **Environment** tab):
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: sandbox REST app credentials.
   - `PAYPAL_WEBHOOK_ID`: leave empty until step 6.
   - `PAYOUT_SMOKE_EMAIL`, `DEMO_VENDOR_EMAIL_1..3`: sandbox personal account emails.
   - `GEMINI_API_KEY`, `VISION_MODEL`: Google AI Studio key and model id.
   - `APP_URL`: the service URL, e.g. `https://payd.onrender.com` (after first deploy).
   - `AG_GRID_LICENSE_KEY`: optional.
   `DATABASE_URL` is wired from `payd-db` automatically; `PAYPAL_ENV` is `sandbox`.
4. Deploy. Build runs `npm ci && npx prisma generate && npm run build`,
   `preDeployCommand` runs `npx prisma migrate deploy`, start runs `npm run start`.
5. Open `https://<your-service>.onrender.com/api/health`; expect
   `{"status":"ok","database":"healthy"}`.
6. In the PayPal developer dashboard (sandbox app > Webhooks) add
   `https://<your-service>.onrender.com/api/webhooks/paypal`, subscribe the
   payout and invoice events listed in docs/PLAN.md section 4, copy the
   Webhook ID into `PAYPAL_WEBHOOK_ID` on Render and redeploy.

Free-tier notes: the web service sleeps when idle, and free Postgres
databases expire after a limited period; check Render's current limits.
