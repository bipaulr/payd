"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CHECK_LABEL, day, RiskBadge, StatusBadge, usd } from "./badges";

interface Row {
  id: string;
  fileName: string;
  status: string;
  riskLevel: "low" | "medium" | "high" | null;
  totalCents: number | null;
  dueDate: string | null;
  paidAt: string | null;
  updatedAt: string;
  proposedVendorName: string | null;
  payeeEmail: string | null;
  vendor: { name: string } | null;
  riskFlags: { check: string; severity: string }[];
}

const RANK = { high: 0, medium: 1, low: 2 } as const;
const rank = (r: Row) => (r.riskLevel ? RANK[r.riskLevel] : 3);
const vendorOf = (r: Row) => r.vendor?.name ?? r.proposedVendorName ?? r.fileName;

/** Risk first (high to low), then earliest due date; no due date sorts last. */
export function sortBills(rows: Row[]) {
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

function BillCard({ r }: { r: Row }) {
  const flagged = r.riskFlags.length > 0 && r.status === "needs_review";
  return (
    <li>
      <Link href={`/bills/${r.id}`} className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{vendorOf(r)}</div>
          <div className="mt-0.5 text-sm text-muted">{r.status === "paid" ? `Paid ${day(r.paidAt)}` : `Due ${day(r.dueDate)}`}</div>
          {flagged && (
            <div className={`mt-0.5 text-sm font-semibold ${r.riskLevel === "high" ? "text-high" : "text-med"}`}>{r.riskFlags.map((f) => CHECK_LABEL[f.check] ?? f.check).join(", ")}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="money font-semibold">{usd(r.totalCents)}</span>
          <StatusBadge status={r.status} />
          <RiskBadge level={r.riskLevel} />
        </div>
      </Link>
    </li>
  );
}

export default function InboxClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [actor, setActor] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bills", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setRows(((await res.json()) as { bills: Row[] }).bills);
      setLoadError(null);
    } catch {
      setLoadError("Could not load the bills. Check that the server and database are running.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // While PayPal is processing a payout, poll so the card flips to Paid on its own.
  const anyPaying = (rows ?? []).some((r) => r.status === "paying");
  useEffect(() => {
    if (!anyPaying) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [anyPaying, load]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setMsg(null);
    const notes: string[] = [];
    let failed = false;
    for (const [i, file] of list.entries()) {
      setBusy(`Reading ${file.name} (${i + 1} of ${list.length}). This can take up to 30 seconds.`);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/bills", { method: "POST", body: form });
        const body = (await res.json()) as { error?: string; duplicate?: boolean };
        if (!res.ok) failed = true;
        notes.push(!res.ok ? `${file.name}: ${body.error ?? "upload failed"}` : body.duplicate ? `${file.name}: this exact file was already uploaded` : `${file.name}: read and checked`);
      } catch {
        failed = true;
        notes.push(`${file.name}: could not reach the server`);
      }
    }
    setMsg({ kind: failed ? "error" : "ok", text: notes.join("  |  ") });
    setBusy(null);
    await load();
  }

  const all = rows ?? [];
  const review = sortBills(all.filter((r) => ["needs_review", "uploaded", "extracted"].includes(r.status)));
  const inProgress = all.filter((r) => r.status === "approved" || r.status === "paying");
  const done = all.filter((r) => ["paid", "failed", "rejected"].includes(r.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lowRisk = review.filter((r) => r.status === "needs_review" && r.riskLevel === "low" && r.totalCents && r.totalCents > 0);

  async function payAll() {
    setBusy("Sending payments to PayPal…");
    try {
      const res = await fetch("/api/bills/pay-low-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName: actor, billIds: lowRisk.map((b) => b.id) }),
      });
      const body = (await res.json()) as { error?: string; results?: { ok: boolean; message?: string }[] };
      if (!res.ok || !body.results) setMsg({ kind: "error", text: body.error ?? "The payments could not be started. Try again." });
      else {
        const ok = body.results.filter((r) => r.ok).length;
        const problems = body.results.filter((r) => !r.ok).map((r) => r.message).join(" ");
        setMsg({
          kind: problems ? "error" : "ok",
          text: `${ok} of ${body.results.length} payments sent to PayPal.${problems ? ` ${problems} Open the bill to retry.` : " They show as Paid once PayPal confirms."}`,
        });
        setConfirmAll(false);
      }
    } catch {
      setMsg({ kind: "error", text: "Could not reach the server. No payment was confirmed; check the bills before retrying." });
    }
    setBusy(null);
    await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="h1">Inbox</h1>
          <p className="mt-1 text-sm text-muted">Bills waiting for your decision, riskiest first.</p>
        </div>
        <button disabled={lowRisk.length === 0 || busy !== null} onClick={() => setConfirmAll(true)} className="btn btn-primary">
          Pay all low-risk ({lowRisk.length})
        </button>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={`mt-5 flex cursor-pointer flex-col items-center rounded-(--radius) border-2 border-dashed px-6 py-7 text-center text-sm ${over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface"}`}
      >
        <span className="font-semibold">{busy ?? "Drop bills here, or click to choose files"}</span>
        <span className="mt-1 text-muted">PDF, PNG, JPEG or WEBP, up to 5 MB each</span>
        <input type="file" multiple disabled={busy !== null} accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }} />
      </label>
      {msg && (
        <p className={`mt-3 rounded-(--radius) px-3 py-2 text-sm ${msg.kind === "error" ? "bg-high-soft text-high" : "bg-ok-soft text-ok"}`} role="status">
          {msg.text}
        </p>
      )}
      {loadError && (
        <p className="mt-3 rounded-(--radius) bg-high-soft px-3 py-2 text-sm text-high" role="alert">
          {loadError}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {rows === null && !loadError && <p className="mt-8 text-sm text-muted">Loading bills…</p>}

      {rows !== null && all.length === 0 && (
        <div className="panel mt-8 px-6 py-10 text-center">
          <p className="font-semibold">No bills yet</p>
          <p className="mt-1 text-sm text-muted">Upload a bill above, or load the sample data to see the full story.</p>
          <Link href="/demo" className="btn btn-primary mt-4">
            Go to the demo
          </Link>
        </div>
      )}

      {review.length > 0 && (
        <section className="mt-8">
          <h2 className="label">Needs your decision ({review.length})</h2>
          <ul className="panel rows mt-2 overflow-hidden">{review.map((r) => <BillCard key={r.id} r={r} />)}</ul>
        </section>
      )}
      {rows !== null && all.length > 0 && review.length === 0 && <p className="mt-8 text-sm text-muted">Nothing is waiting for a decision.</p>}

      {inProgress.length > 0 && (
        <section className="mt-8">
          <h2 className="label">With PayPal ({inProgress.length})</h2>
          <ul className="panel rows mt-2 overflow-hidden">{inProgress.map((r) => <BillCard key={r.id} r={r} />)}</ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="label">Recently closed</h2>
            <Link href="/ledger" className="text-sm font-semibold text-accent underline underline-offset-4">
              All {done.length} in the ledger
            </Link>
          </div>
          <ul className="panel rows mt-2 overflow-hidden">{done.slice(0, 5).map((r) => <BillCard key={r.id} r={r} />)}</ul>
        </section>
      )}

      {confirmAll && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim p-4" role="dialog" aria-modal="true" aria-labelledby="payall-title">
          <div className="panel w-full max-w-lg p-6 shadow-xl">
            <h2 id="payall-title" className="text-lg font-semibold">
              Approve and pay {lowRisk.length} low-risk {lowRisk.length === 1 ? "bill" : "bills"}?
            </h2>
            <ul className="rows mt-4 max-h-64 overflow-auto text-sm">
              {lowRisk.map((b) => (
                <li key={b.id} className="flex justify-between gap-4 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{vendorOf(b)}</span>
                    <span className="block truncate text-muted">{b.payeeEmail ?? "no PayPal email on the bill"}</span>
                  </span>
                  <span className="money shrink-0 font-semibold">{usd(b.totalCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t border-line pt-3 font-semibold">
              <span>Total</span>
              <span className="money">{usd(lowRisk.reduce((s, b) => s + (b.totalCents ?? 0), 0))}</span>
            </p>
            <p className="mt-1 text-xs text-muted">PayPal sandbox. No real money moves.</p>
            <label className="mt-4 block text-sm font-semibold">
              Your name, recorded as the approver
              <input name="approver" autoComplete="name" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="e.g. Paul" className="input mt-1" autoFocus />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmAll(false)} className="btn" disabled={busy !== null}>
                Cancel
              </button>
              <button disabled={!actor.trim() || busy !== null} onClick={() => void payAll()} className="btn btn-primary">
                {busy ? "Paying…" : "Approve and pay all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
