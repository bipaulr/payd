import Link from "next/link";
import HomeOrganiser from "@/components/HomeOrganiser";
import { DM_Mono, Instrument_Sans, Schibsted_Grotesk } from "next/font/google";

// The homepage is set in Hallmark's "Dose" theme; these faces load for this page only.
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: ["700"], variable: "--font-schibsted", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-instrument", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap" });

const steps = [
  { n: "1", tint: "dose-t3", title: "Reads any bill", body: "Drop in a PDF or a photo. A vision model pulls out the vendor, amounts, dates, line items and the PayPal email, with a confidence for each field." },
  { n: "2", tint: "dose-t5", title: "Flags fakes and duplicates", body: "Six checks run on every bill: duplicate, payee changed, unusual amount, math mismatch, lookalike vendor and pressure language. Each flag names its evidence." },
  { n: "3", tint: "dose-t4", title: "Pays after you approve", body: "You approve, PayPal Payouts pays. No approval, no payment. A bill can be paid once, however many times the button is clicked." },
];

const checks = ["Duplicate", "Payee changed", "Unusual amount", "Math mismatch", "Lookalike vendor", "Pressure language"];

export default function Page() {
  return (
    <div className={`dose ${schibsted.variable} ${instrument.variable} ${dmMono.variable}`}>
      <div className="dose-light" aria-hidden>
        <i /><i /><i /><i />
      </div>

      <section className="relative z-[1] grid items-center gap-12 pt-6 pb-16 lg:grid-cols-12 lg:pt-12">
        <div className="lg:col-span-5">
          <h1 className="max-w-[11ch] text-6xl lg:text-7xl">Bills in. Fakes out.</h1>
          <p className="dose-muted mt-6 max-w-[32ch] text-xl leading-8">Reads any bill, flags fakes, and pays through PayPal once you approve.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/demo" className="dose-btn dose-btn--primary">
              Try the demo
            </Link>
            <Link href="/inbox" className="dose-btn">
              Upload your own bill
            </Link>
          </div>
          <p className="dose-muted mt-5 text-sm">No login. Takes under a minute.</p>
        </div>

        <HomeOrganiser />
      </section>

      <section className="relative z-[1] space-y-5 pb-16">
        {steps.map((s) => (
          <div key={s.n} className={`dose-plastic ${s.tint} grid items-center gap-8 p-8 lg:grid-cols-12 lg:p-12`}>
            <div className="lg:col-span-6">
              <p className="dose-num" aria-hidden>
                {s.n}
              </p>
              <h2 className="mt-3 text-3xl lg:text-4xl">{s.title}</h2>
              <p className="mt-4 max-w-[44ch] text-lg leading-8">{s.body}</p>
            </div>

            <div className="min-w-0 lg:col-span-6">
              {s.n === "1" && (
                <div className="dose-label mx-auto max-w-sm p-5 text-sm">
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2">
                    <dt className="dose-muted">Vendor</dt>
                    <dd>Brightleaf Office Supply</dd>
                    <dt className="dose-muted">Invoice</dt>
                    <dd className="dose-fig">BL-20417</dd>
                    <dt className="dose-muted">Due</dt>
                    <dd className="dose-fig">2026-12-06</dd>
                    <dt className="dose-muted">Total</dt>
                    <dd className="dose-fig">$202.96</dd>
                    <dt className="dose-muted">PayPal</dt>
                    <dd className="break-all">billing@brightleaf-supply.example</dd>
                  </dl>
                  <div className="dose-label-stub mt-4 pt-4">
                    <span className="dose-stamp">Read from the PDF</span>
                  </div>
                </div>
              )}
              {s.n === "2" && (
                <ul className="flex flex-wrap gap-2.5">
                  {checks.map((c) => (
                    <li key={c} className="dose-key">
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {s.n === "3" && (
                <div className="dose-label mx-auto max-w-sm p-5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <span>Harborline IT Services</span>
                    <span className="dose-fig">$1,580.47</span>
                  </div>
                  <ol className="mt-3 space-y-1">
                    <li>Approved by you</li>
                    <li>Sent with PayPal Payouts</li>
                    <li>Paid once</li>
                  </ol>
                  <div className="dose-label-stub mt-4 pt-4">
                    <span className="dose-stamp">Paid, sandbox</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="dose-band-ink relative z-[1] mb-6 grid gap-8 p-8 lg:grid-cols-12 lg:p-14">
        <h2 className="text-4xl lg:col-span-5 lg:text-5xl">What the demo shows</h2>
        <div className="lg:col-span-7">
          <p className="max-w-[60ch] text-lg leading-8">
            Five new bills arrive for a jewelry studio with five regular vendors. Three are fine and get paid through the PayPal sandbox. One is a
            second copy of a bill that was already paid. One uses a known vendor&rsquo;s name with a new PayPal email, four times the usual amount and
            an urgent note.
          </p>
          <p className="dose-mint mt-4 text-lg font-medium">payD stops those two and says why.</p>
        </div>
      </section>
    </div>
  );
}
