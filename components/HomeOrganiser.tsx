"use client";

import { useState } from "react";

/** The demo's five bills, as the app reports them: three paid, two stopped. */
const BILLS = [
  { initial: "B", short: "Brightleaf", vendor: "Brightleaf Office Supply", invoice: "BL-20417", total: "$202.96", paid: true, tint: "dose-t1", lines: ["No checks fired", "Payee matches past payments", "Amount is in the usual range"] },
  { initial: "H", short: "Harborline", vendor: "Harborline IT Services", invoice: "HIT-2026-0193", total: "$1,580.47", paid: true, tint: "dose-t2", lines: ["No checks fired", "Payee matches past payments", "Amount is in the usual range"] },
  { initial: "G", short: "Greenfork", vendor: "Greenfork Catering Co.", invoice: "GF-5521", total: "$364.26", paid: true, tint: "dose-t4", lines: ["No checks fired", "Payee matches past payments", "Amount is in the usual range"] },
  { initial: "P", short: "Pinecrest", vendor: "Pinecrest Print Works", invoice: "PPW-3107", total: "$414.62", paid: false, tint: "dose-t5", lines: ["Duplicate", "Invoice PPW-3107 was already paid", "A second copy, in a new file"] },
  { initial: "A", short: "Asha Traders", vendor: "Asha Traders", invoice: "AT-1093", total: "$1,887.00", paid: false, tint: "dose-t7", lines: ["Payee changed", "Unusual amount", "Pressure language"] },
];

function Tick({ grey = false }: { grey?: boolean }) {
  return (
    <span className={`dose-tick ${grey ? "dose-tick--grey" : ""}`} aria-hidden>
      <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {grey ? <path d="M3 6h6" /> : <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />}
      </svg>
    </span>
  );
}

/**
 * The homepage hero object: one plastic compartment per demo bill. Hovering,
 * focusing or tapping a compartment (or its tag) shows that bill on the label.
 */
export default function HomeOrganiser() {
  const [active, setActive] = useState(BILLS.length - 1);
  const bill = BILLS[active];

  return (
    <figure className="relative min-w-0 lg:col-span-7">
      <div className="dose-label relative z-[2] mx-auto w-full max-w-sm p-5 text-sm lg:ml-[18%]" aria-live="polite">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium">{bill.vendor}</span>
          <span className="dose-fig">{bill.invoice}</span>
        </div>
        <p className="dose-fig mt-3 text-2xl font-medium">{bill.total}</p>
        <ul className="mt-3 min-h-[4.5rem] space-y-1">
          {bill.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="dose-label-stub mt-4 pt-4">
          <span className={`dose-stamp ${bill.paid ? "" : "dose-stamp--grey"}`}>{bill.paid ? "Paid, low risk" : "Stopped, high risk"}</span>
        </div>
      </div>

      <div className="dose-organiser relative z-[1] -mt-6 px-2">
        {BILLS.map((b, i) => (
          <button
            key={b.initial}
            type="button"
            className={`dose-plastic dose-tray ${b.tint}`}
            aria-pressed={i === active}
            aria-label={`Show the ${b.vendor} bill`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
          >
            {b.initial}
          </button>
        ))}
      </div>

      <ul className="relative z-[2] mt-12 flex flex-wrap justify-center gap-2">
        {BILLS.map((b, i) => (
          <li key={b.short}>
            <button
              type="button"
              className="dose-tag"
              aria-pressed={i === active}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <Tick grey={!b.paid} />
              <span>
                <span className="font-medium">{b.short}</span> {b.paid ? "paid" : "stopped"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <figcaption className="dose-muted mt-4 text-center text-sm">The demo&rsquo;s five bills. Point at one to see what payD found.</figcaption>
    </figure>
  );
}
