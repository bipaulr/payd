import Link from "next/link";

const steps = [
  { n: "1", tint: "bg-[#ffcfd2]", title: "Reads any bill", body: "Drop in a PDF or a photo. A vision model pulls out the vendor, amounts, dates, line items and the PayPal email, with a confidence for each field." },
  { n: "2", tint: "bg-[#cfbaf0]", title: "Flags fakes and duplicates", body: "Six checks run on every bill: duplicate, payee changed, unusual amount, math mismatch, lookalike vendor and pressure language. Each flag names its evidence." },
  { n: "3", tint: "bg-[#98f5e1]", title: "Pays after you approve", body: "You approve, PayPal Payouts pays. No approval, no payment. A bill can be paid once, however many times the button is clicked." },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl py-10">
      <p className="label">AI finance clerk for small businesses</p>
      <h1 className="mt-3 text-5xl font-semibold leading-tight tracking-tight">
        Bills in. Fakes out.
        <br />
        <span className="text-accent">Paid with PayPal</span> when you say so.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
        payD reads any bill, flags fakes and duplicates, and pays through PayPal after a human approves.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/demo" className="btn btn-primary px-5 py-3 text-base">
          Try the demo
        </Link>
        <Link href="/inbox" className="btn px-5 py-3 text-base">
          Upload your own bill
        </Link>
        <span className="text-sm text-muted">No login. Takes under a minute.</span>
      </div>

      <ol className="mt-14 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="card p-5">
            <span className={`money flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[#26233a] ${s.tint}`}>{s.n}</span>
            <h2 className="mt-4 font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">What the demo shows</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Five new bills arrive for a jewelry studio with five regular vendors. Three are fine and get paid through the PayPal sandbox. One is a
          second copy of a bill that was already paid. One uses a known vendor&apos;s name with a new PayPal email, four times the usual amount
          and an urgent note. payD stops those two and says why.
        </p>
      </section>
    </div>
  );
}
