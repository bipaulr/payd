"use client";

import { useCallback, useEffect, useState } from "react";
import { day, RiskBadge, StatusBadge, usd } from "./badges";

interface Detail {
  id: string;
  status: string;
  fileName: string;
  mimeType: string;
  riskLevel: "low" | "medium" | "high" | null;
  riskSummary: string | null;
  vendor: { name: string; paypalEmail: string } | null;
  proposedVendorName: string | null;
  payeeEmail: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  extraction: { flaggedFields?: string[] } | null;
  extractionError: string | null;
  riskFlags: { id: string; check: string; severity: string; reason: string }[];
  approvals: { decision: string; actorName: string; reason: string | null; overrideReason: string | null; receiverEmail: string | null }[];
  payout: { senderBatchId: string; payoutBatchId: string | null; batchStatus: string | null; itemStatus: string | null; receiverEmail: string; lastError: string | null } | null;
  activity: { id: string; actor: string; action: string; detail: Record<string, unknown>; createdAt: string }[];
}

const cents = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

type FieldKey = "vendorName" | "payeeEmail" | "invoiceNumber" | "issueDate" | "dueDate" | "subtotal" | "tax" | "total";
const FIELDS: { key: FieldKey; label: string; extracted: string; get: (b: Detail) => string }[] = [
  { key: "vendorName", label: "Vendor", extracted: "vendorName", get: (b) => b.vendor?.name ?? b.proposedVendorName ?? "" },
  { key: "payeeEmail", label: "PayPal email on bill", extracted: "vendorPaypalEmail", get: (b) => b.payeeEmail ?? "" },
  { key: "invoiceNumber", label: "Invoice number", extracted: "invoiceNumber", get: (b) => b.invoiceNumber ?? "" },
  { key: "issueDate", label: "Issue date", extracted: "issueDate", get: (b) => (b.issueDate ? day(b.issueDate) : "") },
  { key: "dueDate", label: "Due date", extracted: "dueDate", get: (b) => (b.dueDate ? day(b.dueDate) : "") },
  { key: "subtotal", label: "Subtotal (USD)", extracted: "subtotal", get: (b) => cents(b.subtotalCents) },
  { key: "tax", label: "Tax (USD)", extracted: "tax", get: (b) => cents(b.taxCents) },
  { key: "total", label: "Total (USD)", extracted: "total", get: (b) => cents(b.totalCents) },
];

export default function BillClient({ id }: { id: string }) {
  const [bill, setBill] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);
  const [actor, setActor] = useState("");
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/bills/${id}`, { cache: "no-store" });
    if (res.ok) setBill(((await res.json()) as { bill: Detail }).bill);
    else setErr("Bill not found");
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Poll every 3 seconds while PayPal is processing the payout.
  const paying = bill?.status === "paying";
  useEffect(() => {
    if (!paying) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [paying, load]);

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/bills/${id}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string; bill?: Detail };
    if (json.bill) setBill(json.bill);
    if (!res.ok) setErr(json.error ?? "Request failed");
    else setModal(null);
    setBusy(false);
    return res.ok;
  }

  if (err && !bill) return <p>{err}</p>;
  if (!bill) return <p>Loading...</p>;

  const flagged = new Set(bill.extraction?.flaggedFields ?? []);
  const editable = bill.status === "needs_review";
  const name = bill.vendor?.name ?? bill.proposedVendorName ?? bill.fileName;

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <StatusBadge status={bill.status} />
        <RiskBadge level={bill.riskLevel} />
      </div>
      {err && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800" role="alert">{err}</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="h-[70vh] rounded border border-zinc-200">
          {bill.mimeType === "application/pdf" ? (
            <iframe title="Original bill" src={`/api/bills/${id}/file`} className="h-full w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Original bill" src={`/api/bills/${id}/file`} className="h-full w-full object-contain" />
          )}
        </div>

        <div className="space-y-5">
          {bill.extractionError && <p className="rounded bg-amber-50 p-2 text-sm">Extraction failed: {bill.extractionError}. Type the fields yourself.</p>}
          <section>
            <h2 className="font-medium">Extracted fields</h2>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <FieldInput
                  key={`${f.key}:${f.get(bill)}`}
                  label={f.label}
                  value={f.get(bill)}
                  low={flagged.has(f.extracted)}
                  disabled={!editable || busy || (f.key === "vendorName" && !!bill.vendor)}
                  onCommit={(v) => void call("", "PATCH", { [f.key]: v === "" ? null : v })}
                />
              ))}
            </div>
            {flagged.size > 0 && <p className="mt-2 text-xs text-amber-800">Highlighted fields had low extraction confidence. Check them against the document.</p>}
          </section>

          <section>
            <h2 className="font-medium">Risk</h2>
            <p className="mt-1 text-sm text-zinc-700">{bill.riskSummary ?? "Not assessed yet."}</p>
            <ul className="mt-2 space-y-2">
              {bill.riskFlags.map((f) => (
                <li key={f.id} className={`rounded border p-2 text-sm ${f.severity === "high" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
                  <span className="font-medium">{f.check.replace(/_/g, " ")}</span> ({f.severity}): {f.reason}
                </li>
              ))}
              {bill.riskFlags.length === 0 && bill.riskLevel && <li className="text-sm text-green-800">No flags.</li>}
            </ul>
          </section>

          <section className="flex flex-wrap items-center gap-2">
            {editable && (
              <>
                <button disabled={busy} onClick={() => { setText(""); setModal("approve"); }} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-40">
                  Approve and pay
                </button>
                <button disabled={busy} onClick={() => { setText(""); setModal("reject"); }} className="rounded border border-zinc-300 px-3 py-2 text-sm">
                  Reject
                </button>
              </>
            )}
            {bill.status === "approved" && (
              <button disabled={busy} onClick={() => void call("/retry-payment", "POST")} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white">
                Retry payment
              </button>
            )}
            {bill.payout?.payoutBatchId && (
              <button disabled={busy} onClick={() => void call("/refresh", "POST")} className="rounded border border-zinc-300 px-3 py-2 text-sm">
                Refresh from PayPal
              </button>
            )}
          </section>

          {bill.payout && (
            <section className="rounded border border-zinc-200 p-3 text-sm">
              <div>Payout batch: <code>{bill.payout.payoutBatchId ?? "not accepted yet"}</code></div>
              <div>PayPal status: batch {bill.payout.batchStatus ?? "-"}, item {bill.payout.itemStatus ?? "-"}</div>
              <div>Sandbox receiver: {bill.payout.receiverEmail}</div>
              {bill.payout.lastError && <div className="text-red-800">Last error: {bill.payout.lastError}</div>}
            </section>
          )}

          <section>
            <h2 className="font-medium">Activity</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {bill.activity.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <time className="w-40 shrink-0 text-zinc-500">{new Date(a.createdAt).toLocaleString()}</time>
                  <span>
                    <span className="font-medium">{label(a.action)}</span> <span className="text-zinc-500">({a.actor})</span> {summarize(a)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded bg-white p-6">
            {modal === "approve" ? (
              <>
                <h2 className="text-lg font-semibold">Approve and pay</h2>
                <p className="mt-2 text-sm">Amount: <strong>{usd(bill.totalCents)}</strong> USD</p>
                <p className="text-sm">PayPal email on the bill: <strong>{bill.payeeEmail ?? "none"}</strong></p>
                <p className="mt-1 text-xs text-zinc-500">Sandbox: no real money moves.</p>
                {bill.riskLevel === "high" && (
                  <>
                    <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">High risk. Type why you are overriding the flags.</p>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Override reason" className="mt-2 w-full rounded border border-zinc-300 p-2 text-sm" />
                  </>
                )}
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Reject this bill</h2>
                <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Reason" className="mt-2 w-full rounded border border-zinc-300 p-2 text-sm" />
              </>
            )}
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Your name" className="mt-3 w-full rounded border border-zinc-300 p-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded px-3 py-2 text-sm">Cancel</button>
              <button
                disabled={busy || !actor.trim() || (modal === "reject" && !text.trim()) || (modal === "approve" && bill.riskLevel === "high" && !text.trim())}
                onClick={() =>
                  void (modal === "approve"
                    ? call("/approve", "POST", { actorName: actor, overrideReason: text || null, confirmAmountCents: bill.totalCents ?? undefined, confirmPayeeEmail: bill.payeeEmail })
                    : call("/reject", "POST", { actorName: actor, reason: text }))
                }
                className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                {modal === "approve" ? "Confirm and pay" : "Confirm reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput(p: { label: string; value: string; low: boolean; disabled: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(p.value);
  return (
    <label className="text-xs text-zinc-600">
      {p.label}
      <input
        value={v}
        disabled={p.disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== p.value && p.onCommit(v.trim())}
        className={`mt-1 w-full rounded border p-2 text-sm text-zinc-900 ${p.low ? "border-amber-500 bg-amber-50" : "border-zinc-300"}`}
      />
    </label>
  );
}

const LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  extracted: "Extracted",
  flagged: "Flagged for review",
  risk_assessed: "Risk checked",
  edited: "Edited",
  approved: "Approved",
  rejected: "Rejected",
  payment_started: "Payment started",
  payout_created: "Payout batch created",
  webhook_received: "Webhook received",
  status_paid: "Paid",
  status_failed: "Payment failed",
};
const label = (a: string) => LABELS[a] ?? a.replace(/_/g, " ");

function summarize(a: { action: string; detail: Record<string, unknown> }) {
  const d = a.detail;
  if (d.payoutBatchId) return `batch ${String(d.payoutBatchId)}`;
  if (a.action === "payment_started" && d.senderBatchId) return `sender batch ${String(d.senderBatchId)}`;
  if (a.action === "risk_assessed") return `level ${String(d.level)}`;
  if (a.action === "approved" || a.action === "rejected") return `by ${String(d.actorName)}${d.reason ? `: ${String(d.reason)}` : ""}`;
  return "";
}
