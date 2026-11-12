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
   - `GEMINI_API_KEY`: Google AI Studio key. `VISION_MODEL` and `VISION_MODEL_FALLBACK` are preset.
   - `APP_URL`: the service URL, e.g. `https://payd.onrender.com` (after first deploy).
   - `AG_GRID_LICENSE_KEY`: optional.
   `DATABASE_URL` is wired from `payd-db` automatically; `PAYPAL_ENV` is `sandbox`.
4. Deploy. Build runs `npm ci && npx prisma generate && npm run build`,
   and the start command runs `npx prisma migrate deploy && npm run start` (the free plan has no pre-deploy step).
5. Open `https://<your-service>.onrender.com/api/health`; expect
   `{"status":"ok","database":"healthy"}`.
6. In the PayPal developer dashboard (sandbox app > Webhooks) add
   `https://<your-service>.onrender.com/api/webhooks/paypal`, subscribe all
   "Payment payouts-item" and "Payment payoutsbatch" events (listed in docs/PLAN.md section 4), copy the
   Webhook ID into `PAYPAL_WEBHOOK_ID` on Render and redeploy.

7. Open the site, go to Demo and click **Load sample data**. Pay one bill and check its
   timeline shows "PayPal webhook received".

The build command installs dev dependencies (`npm ci --include=dev`) because the
build needs TypeScript and Tailwind.

Free-tier notes: the web service sleeps when idle, and free Postgres
databases expire after a limited period; check Render's current limits.
