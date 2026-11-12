"use client";

import Link from "next/link";
import { useState } from "react";
import { CHECK_LABEL, RiskBadge, usd } from "@/components/badges";

interface Outcome {
  billId: string;
  file: string;
  kind: "clean" | "duplicate" | "fake";
  vendor: string | null;
  riskLevel: string | null;
  totalCents: number | null;
  flags: { check: string; reason: string }[];
}
interface LoadResult {
  vendors: number;
  historyBills: number;
  bills: Outcome[];
}

const KIND: Record<Outcome["kind"], string> = { clean: "Genuine bill", duplicate: "Second copy of a paid bill", fake: "Fake: changed payee" };

export default function Page() {
  const [busy, setBusy] = useState<"load" | "reset" | null>(null);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run(action: "load" | "reset") {
    if (action === "reset" && !window.confirm("Delete every bill, vendor and payment record in this demo?")) return;
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/demo/${action}`, { method: "POST" });
      const body = (await res.json()) as LoadResult & { error?: string };
      if (!res.ok) setMsg({ kind: "error", text: body.error ?? "Something went wrong. Try again." });
      else if (action === "load") {
        setResult(body);
        setMsg({ kind: "ok", text: `Loaded ${body.vendors} vendors, ${body.historyBills} paid bills of history and ${body.bills.length} new bills.` });
      } else {
        setResult(null);
        setMsg({ kind: "ok", text: "All data removed. The inbox and ledger are empty." });
      }
    } catch {
      setMsg({ kind: "error", text: "Could not reach the server. Check your connection and try again." });
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="h1">Demo</h1>
      <p className="mt-2 max-w-2xl text-muted">
        One click loads an invented jewelry studio: five vendors with months of paid bills, and five new bills waiting in the inbox. Everything is
        made up. Payments go to PayPal sandbox accounts.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary px-5 py-2.5" disabled={busy !== null} onClick={() => void run("load")}>
          {busy === "load" ? "Loading sample data..." : "Load sample data"}
        </button>
        <button className="btn" disabled={busy !== null} onClick={() => void run("reset")}>
          {busy === "reset" ? "Resetting..." : "Reset"}
        </button>
        {msg && (
          <p role="status" className={`text-sm ${msg.kind === "error" ? "text-high" : "text-ok"}`}>
            {msg.text}
          </p>
        )}
      </div>

      {result && (
        <section className="card mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-semibold">Five new bills are in the inbox</h2>
            <Link href="/inbox" className="btn btn-primary">
              Open the inbox
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {result.bills.map((b) => (
              <li key={b.billId} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/bills/${b.billId}`} className="font-medium hover:underline">
                    {b.vendor ?? b.file}
                  </Link>
                  <p className="text-sm text-muted">
                    {KIND[b.kind]}
                    {b.flags.length > 0 && `. Caught by: ${b.flags.map((f) => CHECK_LABEL[f.check] ?? f.check).join(", ")}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="money font-medium">{usd(b.totalCents)}</span>
                  <RiskBadge level={b.riskLevel} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-semibold">The story, in under a minute</h2>
        <ol className="mt-3 space-y-2 text-sm leading-6">
          {[
            ["Load sample data", "Five vendors, 35 paid bills and five new bills appear."],
            ["Open the inbox", "The two risky bills sort to the top with red badges."],
            ["Open the Asha Traders bill", "Same name and logo as a real vendor, a new PayPal email, about four times the usual amount, and an urgent note. Three flags explain it. Reject it."],
            ["Open the Pinecrest Print Works bill", "Its invoice number was already paid last month. Reject it."],
            ["Pay all low-risk", "One confirmation lists the three genuine bills. Approve, and PayPal Payouts pays each one in the sandbox."],
            ["Open the ledger", "All 40 bills, with status, risk, PayPal batch ids, saved views and CSV export."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="money mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">{i + 1}</span>
              <span>
                <strong className="font-semibold">{title}.</strong> <span className="text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">
          The five sample files are in the repository under <code className="rounded bg-surface-2 px-1">samples/demo</code>. You can also drop your own
          bill on the inbox. Reset clears everything for the next visitor.
        </p>
      </section>
    </div>
  );
}
