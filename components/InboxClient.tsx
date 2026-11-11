"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { day, RiskBadge, StatusBadge, usd } from "./badges";

interface Row {
  id: string;
  fileName: string;
  status: string;
  riskLevel: "low" | "medium" | "high" | null;
  totalCents: number | null;
  dueDate: string | null;
  proposedVendorName: string | null;
  payeeEmail: string | null;
  vendor: { name: string } | null;
}

const RANK = { high: 0, medium: 1, low: 2 } as const;
const rank = (r: Row) => (r.riskLevel ? RANK[r.riskLevel] : 3);
const vendorOf = (r: Row) => r.vendor?.name ?? r.proposedVendorName ?? r.fileName;

/** Risk first (high to low), then earliest due date; no due date sorts last. */
export function sortBills(rows: Row[]) {
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

export default function InboxClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [actor, setActor] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/bills", { cache: "no-store" });
    setRows(((await res.json()) as { bills: Row[] }).bills);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    setMsg(null);
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/bills", { method: "POST", body: form });
      const body = (await res.json()) as { error?: string; duplicate?: boolean };
      notes.push(!res.ok ? `${file.name}: ${body.error}` : body.duplicate ? `${file.name}: already uploaded` : `${file.name}: uploaded`);
    }
    setMsg(notes.join(" | "));
    setBusy(false);
    await load();
  }

  const lowRisk = sortBills((rows ?? []).filter((r) => r.status === "needs_review" && r.riskLevel === "low" && r.totalCents && r.totalCents > 0));

  async function payAll() {
    setBusy(true);
    const res = await fetch("/api/bills/pay-low-risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorName: actor, billIds: lowRisk.map((b) => b.id) }),
    });
    const body = (await res.json()) as { error?: string; results?: { ok: boolean; message?: string }[] };
    if (!res.ok) setMsg(body.error ?? "Failed");
    else {
      const ok = body.results!.filter((r) => r.ok).length;
      setMsg(`Paid ${ok} of ${body.results!.length} bills.${body.results!.filter((r) => !r.ok).map((r) => ` ${r.message}`).join("")}`);
      setConfirmAll(false);
    }
    setBusy(false);
    await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <button
          disabled={lowRisk.length === 0 || busy}
          onClick={() => setConfirmAll(true)}
          className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
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
        className={`mt-4 flex cursor-pointer flex-col items-center rounded border-2 border-dashed p-8 text-sm ${over ? "border-zinc-900 bg-zinc-50" : "border-zinc-300"}`}
      >
        <span>{busy ? "Working... extraction can take a few seconds" : "Drop bills here (PDF, PNG, JPEG, WEBP, max 5 MB) or click to choose"}</span>
        <input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
      </label>
      {msg && <p className="mt-3 text-sm text-zinc-700" role="status">{msg}</p>}

      <ul className="mt-6 space-y-3">
        {rows && sortBills(rows).map((r) => (
          <li key={r.id}>
            <Link href={`/bills/${r.id}`} className="flex items-center justify-between rounded border border-zinc-200 p-4 hover:bg-zinc-50">
              <div>
                <div className="font-medium">{vendorOf(r)}</div>
                <div className="text-sm text-zinc-600">Due {day(r.dueDate)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{usd(r.totalCents)}</span>
                <StatusBadge status={r.status} />
                <RiskBadge level={r.riskLevel} />
              </div>
            </Link>
          </li>
        ))}
        {rows?.length === 0 && <li className="text-sm text-zinc-600">No bills yet. Upload one above.</li>}
      </ul>

      {confirmAll && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded bg-white p-6">
            <h2 className="text-lg font-semibold">Pay {lowRisk.length} low-risk bills?</h2>
            <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm">
              {lowRisk.map((b) => (
                <li key={b.id} className="flex justify-between">
                  <span>{vendorOf(b)} ({b.payeeEmail ?? "no email"})</span>
                  <span>{usd(b.totalCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-medium">Total {usd(lowRisk.reduce((s, b) => s + (b.totalCents ?? 0), 0))}</p>
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Your name (recorded as the approver)" className="mt-3 w-full rounded border border-zinc-300 p-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmAll(false)} className="rounded px-3 py-2 text-sm">Cancel</button>
              <button disabled={!actor.trim() || busy} onClick={() => void payAll()} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-40">
                Approve and pay all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
