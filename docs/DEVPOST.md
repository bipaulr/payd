# payD: Devpost submission text

**Tagline:** An AI finance clerk that reads any bill, flags fakes and duplicates, and pays through PayPal after a human approves.

Links to fill in: hosted demo `APP_URL`, video `VIDEO_URL`, code https://github.com/bipaulr/payd

## Inspiration

Small businesses pay bills by hand. The owner opens a PDF, types the numbers into a spreadsheet and sends the money. That routine is what invoice fraud relies on. A fake bill copies a real vendor's name and logo, changes the payment address and adds "urgent, our details have changed". Duplicates are the quieter problem: the same bill arrives twice and gets paid twice. Large companies have accounts payable teams and controls for this. A five-person shop has one tired person at the end of the day. We wanted to give that person a clerk who reads everything, remembers everything and never pays without asking.

## What it does

payD takes a bill as a PDF or a photo and does four things.

1. **Reads it.** A vision model extracts the vendor, the PayPal email, invoice number, dates, line items, tax and total, with a confidence score for each field. Low-confidence fields are highlighted next to the original document so the owner can fix them.
2. **Checks it.** Six risk checks run on every bill: duplicate, payee changed, unusual amount, math mismatch, lookalike vendor and pressure language. Each flag states its evidence. Example: "Past 6 payments to Asha Traders went to accounts@ashatraders.example. This bill asks for asha.traders.pay@mail.example."
3. **Asks.** Bills wait in an inbox sorted by risk. The owner approves or rejects. A high-risk bill cannot be approved without a typed reason. Low-risk bills can be approved together with one confirmation that lists every bill and amount.
4. **Pays.** Approved bills are paid with PayPal Payouts. A verified PayPal webhook, or a status check when webhooks are late, marks the bill paid. Everything lands in a ledger with filters, saved views, categories and CSV export.

The demo loads a made-up jewelry studio with five vendors and 35 paid bills, then five new bills. Three are genuine and get paid in the PayPal sandbox. One is a second copy of a bill that was already paid. One is a fake with a changed payee, four times the usual amount and an urgent note. payD stops both and explains why.

## How we built it

- **Next.js (App Router) and TypeScript** in strict mode, with Tailwind for styling.
- **Postgres and Prisma.** Money is stored as integer cents. Bills move through a small state machine, and every change is a conditional update with a timeline entry.
- **PayPal sandbox.** OAuth client credentials, Payouts (create and get batch) and webhook signature verification. Each payout uses a `sender_batch_id` and request id derived from the bill id, and the database allows one payout per bill, so a double click or a retry cannot pay twice.
- **Risk engine.** Five checks are pure functions over the bill and the vendor's history, so they are fast, testable and explainable. The sixth uses the model to read the payment instructions, with a keyword scan as a fallback.
- **AG Grid Community** for the ledger: custom badge cells, saved views, inline category editing, a pinned totals row and CSV export.
- **Render** for hosting: one web service and one Postgres database from `render.yaml`.
- **Tests.** 75 automated tests. The payment tests run against a real Postgres with a mocked PayPal and cover double payment, payment without approval, replayed webhooks and bad signatures.

## Challenges

- **Making "pay once" true, not just likely.** PayPal only blocks a reused batch id for 30 days. We added a row lock, unique keys and a request id so that five parallel clicks create exactly one payout. We proved it with a test and by firing parallel requests at the running app.
- **Webhooks that cannot be faked.** Every delivery is verified with PayPal before it is trusted. An unverified event is stored for audit under a random key, so a forged event can never block the real one.
- **The sandbox is not production.** Vendor emails on demo documents are invented, but a payout needs a real sandbox account. We keep the email printed on the bill separate from the sandbox account that is paid, and show both in the confirmation. The fraud checks always use the printed email.
- **Free-tier model limits.** The main Gemini model was overloaded for most of the build and the first fallback ran out of quota. We added a chain of fallback models, a cache keyed by file hash, and made sure every model failure degrades to a safe default.
- **An interrupted build.** An unattended build script marked two steps as done when the network dropped. We audited every step by running its checks again instead of trusting the logs.

## What we learned

- Keep the model away from decisions about money. It reads and it explains. Rules decide the risk level and a person decides the payment.
- An explanation with evidence is worth more than a score. "Different email than the last 6 payments" is something an owner can act on.
- Idempotency has to be designed at three levels: the request to PayPal, the database, and the user interface.
- A demo that depends on a live model call will fail at the worst moment. Cache what can be cached.

## What's next

- "Ask payD": a command bar that creates and sends PayPal invoices with the PayPal Agent Toolkit and answers questions such as "why was this bill flagged?".
- Accounts, roles and two-person approval for large bills.
- Bills read straight from an email inbox.
- Payments scheduled for the due date.
- More payout methods and currencies beyond the USD sandbox.

## Tools

Every model and AI service used, and how:

| Tool | How it was used |
|---|---|
| **Google Gemini** (free tier, Google AI Studio), called through the Vercel AI SDK | In the product. Reads each bill image or PDF into structured fields with confidence scores. Detects urgency and changed-payment-details wording in payment instructions. Writes the two-sentence risk summary. |
| **Claude Code** (Anthropic) | Coding tool. Used to plan, write, test and audit the code and to draft this text. |
| **PayPal REST APIs** (sandbox): OAuth, Payouts, Webhooks | Payments and payment status. |
| **AG Grid Community** | The ledger grid. |
| **Render** | Hosting for the web service and Postgres. |
| Next.js, TypeScript, Tailwind CSS, Prisma, Postgres, Zod, Vitest, pdf-lib | Application framework, database, validation, tests and sample bill generation. |

No AI-generated images, music or voices are used. All vendors, people and addresses in the demo are invented.

## How this answers the judging criteria

- **Technological implementation.** PayPal Payouts is the core of the product, with verified webhooks, idempotent payouts, integer-cent money and 75 tests. The AI is used where it is strong (reading and explaining) and fenced off from where it is risky (deciding).
- **Design.** One flow from inbox to bill to ledger. The risk panel is the first thing on a bill page and reads in a few seconds. Light and dark themes, clear empty and error states.
- **Potential impact.** Invoice fraud and duplicate payments hit the businesses least able to absorb them. payD needs no setup beyond a PayPal account and works with the bills a business already receives.
- **Innovation.** The combination: a model reads the bill, transparent rules judge it against the vendor's own history, and the payment rail refuses to move without a recorded human decision.
- **Presentation.** A hosted demo with no login, one-click sample data, and a story that runs in under a minute: three bills paid, one duplicate blocked, one fake blocked.

## Video outline (under 3 minutes)

1. 0:00 The problem in two sentences over the landing page.
2. 0:15 Demo page, **Load sample data**.
3. 0:25 Inbox: two red bills on top. Open Asha Traders, read the three flags against the document, reject.
4. 1:05 Open Pinecrest Print Works, show the duplicate flag, reject.
5. 1:25 **Pay all low-risk**: the confirmation, then the three cards turning to Paid. Open one to show the PayPal batch id and timeline.
6. 2:05 Ledger: saved views, edit a category, totals row, export CSV.
7. 2:30 Upload a new bill to show live reading (optional if quota allows).
8. 2:45 Close: no approval, no payment; a bill is paid once.

Use no third-party logos or copyrighted music in the recording.
