import Link from "next/link";

const steps = [
  { n: "1", tint: "tint-pink", title: "Reads any bill", body: "Drop in a PDF or a photo. A vision model pulls out the vendor, amounts, dates, line items and the PayPal email, with a confidence for each field." },
  { n: "2", tint: "tint-lavender", title: "Flags fakes and duplicates", body: "Six checks run on every bill: duplicate, payee changed, unusual amount, math mismatch, lookalike vendor and pressure language. Each flag names its evidence." },
  { n: "3", tint: "tint-mint", title: "Pays after you approve", body: "You approve, PayPal Payouts pays. No approval, no payment. A bill can be paid once, however many times the button is clicked." },
];

/** What payD says about the demo's fake bill. The same three flags the app raises on it. */
const flags = [
  { check: "Payee changed", reason: "Past 6 payments to Asha Traders went to accounts@ashatraders.example. This bill asks for asha.traders.pay@mail.example." },
  { check: "Unusual amount", reason: "This bill is $1,887.00, more than 3x the $510.00 median of Asha Traders's last 6 bills." },
  { check: "Pressure language", reason: "The payment instructions push for immediate payment and say the payment details changed." },
];

export default function Page() {
  return (
    <div>
      <section className="grid items-center gap-10 py-6 lg:grid-cols-12 lg:py-10">
        <div className="lg:col-span-5">
          <h1 className="display max-w-[12ch] text-6xl lg:text-7xl">Bills in. Fakes out.</h1>
          <p className="mt-6 max-w-[34ch] text-lg leading-8 text-muted">Reads any bill, flags fakes, and pays through PayPal once you approve.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/demo" className="btn btn-primary btn-lg">
              Try the demo
            </Link>
            <Link href="/inbox" className="btn btn-lg">
              Upload your own bill
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">No login. Takes under a minute.</p>
        </div>

        <figure className="min-w-0 lg:col-span-7">
          <div className="rounded-(--radius) border-2 border-high bg-high-soft p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-lg font-semibold text-high">High risk. Do not pay until you have checked this.</p>
              <p className="money text-lg font-semibold">$1,887.00</p>
            </div>
            <dl className="rows mt-4">
              {flags.map((f) => (
                <div key={f.check} className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="font-semibold">{f.check}</dt>
                  <dd className="text-sm leading-6">{f.reason}</dd>
                </div>
              ))}
            </dl>
          </div>
          <figcaption className="mt-3 text-sm text-muted">What payD shows on the fake Asha Traders bill in the demo.</figcaption>
        </figure>
      </section>

      <section className="border-t border-line py-12">
        <ol className="grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n}>
              <span className={`money flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${s.tint}`}>{s.n}</span>
              <h2 className="display mt-4 text-2xl">{s.title}</h2>
              <p className="mt-3 max-w-[40ch] leading-7 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line py-12">
        <div className="grid gap-6 lg:grid-cols-12">
          <h2 className="display text-3xl lg:col-span-4">What the demo shows</h2>
          <div className="lg:col-span-8">
            <p className="max-w-[65ch] text-lg leading-8">
              Five new bills arrive for a jewelry studio with five regular vendors. Three are fine and get paid through the PayPal sandbox. One is a
              second copy of a bill that was already paid. One uses a known vendor&rsquo;s name with a new PayPal email, four times the usual amount
              and an urgent note. payD stops those two and says why.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
