"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CHECK_LABEL, day, RiskBadge, StatusBadge, usd } from "./badges";

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
  receiverEmail: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  paymentInstructions: string | null;
  extraction: { flaggedFields?: string[]; model?: string } | null;
  extractionError: string | null;
  lineItems: { id: string; description: string; quantity: string; unitPriceCents: number; amountCents: number }[];
  riskFlags: { id: string; check: string; severity: string; reason: string }[];
  approvals: { decision: string; actorName: string; reason: string | null; overrideReason: string | null }[];
  payout: { senderBatchId: string; payoutBatchId: string | null; batchStatus: string | null; itemStatus: string | null; receiverEmail: string; lastError: string | null } | null;
  activity: { id: string; actor: string; action: string; detail: Record<string, unknown>; createdAt: string }[];
}

const cents = (c: number | null) => (c == null ? "" : `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const isoDay = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

type FieldKey = "vendorName" | "payeeEmail" | "invoiceNumber" | "issueDate" | "dueDate" | "subtotal" | "tax" | "total";
const FIELDS: { key: FieldKey; label: string; extracted: string; get: (b: Detail) => string }[] = [
  { key: "vendorName", label: "Vendor", extracted: "vendorName", get: (b) => b.vendor?.name ?? b.proposedVendorName ?? "" },
  { key: "payeeEmail", label: "PayPal email on the bill", extracted: "vendorPaypalEmail", get: (b) => b.payeeEmail ?? "" },
  { key: "invoiceNumber", label: "Invoice number", extracted: "invoiceNumber", get: (b) => b.invoiceNumber ?? "" },
  { key: "issueDate", label: "Issue date (YYYY-MM-DD)", extracted: "issueDate", get: (b) => isoDay(b.issueDate) },
  { key: "dueDate", label: "Due date (YYYY-MM-DD)", extracted: "dueDate", get: (b) => isoDay(b.dueDate) },
  { key: "subtotal", label: "Subtotal (USD)", extracted: "subtotal", get: (b) => cents(b.subtotalCents) },
  { key: "tax", label: "Tax (USD)", extracted: "tax", get: (b) => cents(b.taxCents) },
  { key: "total", label: "Total (USD)", extracted: "total", get: (b) => cents(b.totalCents) },
];

const PANEL: Record<string, { box: string; title: string; heading: string }> = {
  high: { box: "border-high bg-high-soft", title: "text-high", heading: "High risk. Do not pay until you have checked this." },
  medium: { box: "border-med bg-med-soft", title: "text-med", heading: "Medium risk. Check the flags before paying." },
  low: { box: "border-ok bg-ok-soft", title: "text-ok", heading: "Low risk. No checks fired." },
};

export default function BillClient({ id }: { id: string }) {
  const [bill, setBill] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);
  const [actor, setActor] = useState("");
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bills/${id}`, { cache: "no-store" });
      if (res.status === 404) return setNotFound(true);
      if (!res.ok) throw new Error();
      setBill(((await res.json()) as { bill: Detail }).bill);
    } catch {
      setErr("Could not load this bill. Check your connection and reload.");
    }
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
    let ok = false;
    try {
      const res = await fetch(`/api/bills/${id}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string; bill?: Detail };
      if (json.bill) setBill(json.bill);
      ok = res.ok;
      if (!ok) setErr(json.error ?? "The request failed. Try again.");
      // A payment error leaves the bill approved; close the dialog so "Retry payment" is visible.
      if (ok || json.bill?.status !== "needs_review") setModal(null);
    } catch {
      setErr("Could not reach the server. Reload the page to see the bill's current state before retrying.");
    }
    setBusy(false);
    return ok;
  }

  if (notFound) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <p className="font-medium">This bill does not exist</p>
        <p className="mt-1 text-sm text-muted">It may have been removed by a demo reset.</p>
        <Link href="/inbox" className="btn btn-primary mt-4">
          Back to the inbox
        </Link>
      </div>
    );
  }
  if (!bill) return <p className={`text-sm ${err ? "text-high" : "text-muted"}`}>{err ?? "Loading bill..."}</p>;

  const flagged = new Set(bill.extraction?.flaggedFields ?? []);
  const editable = bill.status === "needs_review";
  const name = bill.vendor?.name ?? bill.proposedVendorName ?? bill.fileName;
  // A file with no total is not payable, whatever the checks say (often it is not a bill at all).
  const notPayable = bill.totalCents == null && !bill.extractionError && bill.status === "needs_review";
  const panel = notPayable
    ? { box: "border-med bg-med-soft", title: "text-med", heading: "No total was found. This may not be a bill." }
    : (PANEL[bill.riskLevel ?? ""] ?? null);
  const rejection = bill.approvals.find((a) => a.decision === "rejected");
  const override = bill.approvals.find((a) => a.decision === "approved" && a.overrideReason);

  return (
    <div>
      <Link href="/inbox" className="text-sm text-muted hover:text-ink">
        &larr; Inbox
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="h1">{name}</h1>
        <StatusBadge status={bill.status} />
        <RiskBadge level={bill.riskLevel} />
        <span className="money ml-auto text-2xl font-semibold">{usd(bill.totalCents)}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {bill.invoiceNumber ? `Invoice ${bill.invoiceNumber}` : "No invoice number"} · Due {day(bill.dueDate)}
        {!bill.vendor && bill.proposedVendorName && " · New vendor, not on file yet"}
      </p>
      {err && (
        <p className="mt-3 rounded-md bg-high-soft px-3 py-2 text-sm text-high" role="alert">
          {err}
        </p>
      )}

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="card h-[78vh] overflow-hidden xl:sticky xl:top-4">
          {bill.mimeType === "application/pdf" ? (
            <iframe title="Original bill" src={`/api/bills/${id}/file#toolbar=0&view=FitH`} className="h-full w-full bg-white" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Original bill" src={`/api/bills/${id}/file`} className="h-full w-full bg-white object-contain" />
          )}
        </div>

        <div className="space-y-5">
          {/* The risk panel is the first thing to read. */}
          <section className={`rounded-lg border-2 p-5 ${panel ? panel.box : "border-line bg-surface"}`} aria-label="Risk">
            <h2 className={`text-lg font-semibold ${panel ? panel.title : ""}`}>{panel ? panel.heading : "Risk checks have not run yet"}</h2>
            {/* Shown only when the model wrote it; the fallback is just the reasons below joined together. */}
            {bill.riskSummary && bill.riskFlags.length > 0 && bill.riskSummary !== bill.riskFlags.map((f) => f.reason).join(" ") && <p className="mt-2 text-sm leading-6">{bill.riskSummary}</p>}
            {bill.riskFlags.length > 0 && (
              <ul className="mt-4 space-y-2">
                {bill.riskFlags.map((f) => (
                  <li key={f.id} className="rounded-md bg-surface p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${f.severity === "high" ? "bg-high" : "bg-med"}`} aria-hidden />
                      <span className="font-semibold">{CHECK_LABEL[f.check] ?? f.check}</span>
                      <span className="text-xs uppercase tracking-wide text-muted">{f.severity}</span>
                    </div>
                    <p className="mt-1 leading-6">{f.reason}</p>
                  </li>
                ))}
              </ul>
            )}
            {notPayable && <p className="mt-2 text-sm leading-6">The model read the file but found no amount to pay. Type the fields from the document if it is a bill, or reject it. It cannot be paid as it is.</p>}
            {bill.riskFlags.length === 0 && bill.riskLevel && !notPayable && (
              <p className="mt-2 text-sm leading-6">Vendor, payee email, amount and arithmetic are consistent with this vendor&apos;s past bills. Six checks ran.</p>
            )}
          </section>

          {(editable || bill.status === "approved" || bill.status === "paying" || bill.payout) && (
            <section className="card p-5">
              {editable && (
                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={busy || bill.totalCents == null || !bill.riskLevel} title={bill.totalCents == null ? "Enter a total first" : !bill.riskLevel ? "The risk checks have not run yet" : undefined} onClick={() => { setText(""); setModal("approve"); }} className={`btn ${bill.riskLevel === "high" ? "" : "btn-primary"}`}>
                    {bill.riskLevel === "high" ? "Override and pay..." : "Approve and pay"}
                  </button>
                  <button disabled={busy} onClick={() => { setText(""); setModal("reject"); }} className={`btn ${bill.riskLevel === "high" ? "btn-danger" : ""}`}>
                    Reject
                  </button>
                  <span className="text-sm text-muted">Nothing is paid until you approve.</span>
                </div>
              )}
              {bill.status === "approved" && (
                <div className="flex flex-wrap items-center gap-3">
                  <button disabled={busy} onClick={() => void call("/retry-payment", "POST")} className="btn btn-primary">
                    {busy ? "Sending..." : "Retry payment"}
                  </button>
                  <span className="text-sm text-muted">Approved, but PayPal did not accept the payment. A retry cannot pay twice.</span>
                </div>
              )}
              {bill.status === "paying" && (
                <p className="text-sm font-medium text-info" role="status">
                  PayPal is processing this payment. This page updates on its own every few seconds.
                </p>
              )}
              {bill.payout && (
                <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm ${editable || bill.status === "approved" || bill.status === "paying" ? "mt-4" : ""}`}>
                  <dt className="text-muted">PayPal batch</dt>
                  <dd className="font-mono">{bill.payout.payoutBatchId ?? "not accepted yet"}</dd>
                  <dt className="text-muted">PayPal status</dt>
                  <dd>
                    batch {bill.payout.batchStatus ?? "-"}, item {bill.payout.itemStatus ?? "-"}
                  </dd>
                  <dt className="text-muted">Paid to (sandbox)</dt>
                  <dd className="break-all">{bill.payout.receiverEmail}</dd>
                  {bill.payout.lastError && (
                    <>
                      <dt className="text-high">Last error</dt>
                      <dd className="text-high">{bill.payout.lastError}</dd>
                    </>
                  )}
                </dl>
              )}
              {bill.payout?.payoutBatchId && !bill.payout.payoutBatchId.startsWith("SAMPLE-") && bill.status === "paying" && (
                <button disabled={busy} onClick={() => void call("/refresh", "POST")} className="btn mt-4">
                  Refresh from PayPal
                </button>
              )}
            </section>
          )}
          {rejection && (
            <p className="card p-4 text-sm">
              <strong>Rejected by {rejection.actorName}.</strong> {rejection.reason}
            </p>
          )}
          {override && (
            <p className="card p-4 text-sm">
              <strong>High risk overridden by {override.actorName}.</strong> {override.overrideReason}
            </p>
          )}

          <section className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Extracted fields</h2>
              {bill.extraction?.model && <span className="text-xs text-muted">Read by {bill.extraction.model}</span>}
            </div>
            {bill.extractionError && (
              <p className="mt-2 rounded-md bg-med-soft p-3 text-sm text-med">
                The model could not read this file ({bill.extractionError.slice(0, 160)}). Try again, type the fields from the document, or reject the bill.
                {editable && (
                  <button disabled={busy} onClick={() => void call("/re-extract", "POST")} className="btn mt-2 block">
                    {busy ? "Reading..." : "Try reading again"}
                  </button>
                )}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
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
            <p className="mt-3 text-xs text-muted">
              {flagged.size > 0
                ? "Highlighted fields had low extraction confidence. Check them against the document."
                : editable
                  ? "Edit a field if the document says otherwise. The risk checks run again after each change."
                  : "Fields are locked once a decision is made."}
            </p>

            {bill.lineItems.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5 font-medium">Line item</th>
                    <th className="py-1.5 text-right font-medium">Qty</th>
                    <th className="py-1.5 text-right font-medium">Unit</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="money">
                  {bill.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-line last:border-0">
                      <td className="py-1.5">{li.description}</td>
                      <td className="py-1.5 text-right">{Number(li.quantity)}</td>
                      <td className="py-1.5 text-right">{usd(li.unitPriceCents)}</td>
                      <td className="py-1.5 text-right">{usd(li.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {bill.paymentInstructions && (
              <p className="mt-4 text-sm">
                <span className="label block">Payment instructions on the bill</span>
                <span className="mt-1 block leading-6">{bill.paymentInstructions}</span>
              </p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">Activity</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {bill.activity.map((a) => (
                <li key={a.id} className="grid grid-cols-[9.5rem_1fr] gap-3">
                  <time className="money text-muted">{stamp(a.createdAt)}</time>
                  <span>
                    <span className="font-medium">{label(a.action)}</span> <span className="text-muted">{summarize(a)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="card w-full max-w-md p-6 shadow-xl">
            {modal === "approve" ? (
              <>
                <h2 id="modal-title" className="text-lg font-semibold">
                  Approve and pay {name}?
                </h2>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted">Amount</dt>
                  <dd className="money text-base font-semibold">{usd(bill.totalCents)} USD</dd>
                  <dt className="text-muted">PayPal email on the bill</dt>
                  <dd className="break-all font-medium">{bill.payeeEmail ?? "none printed"}</dd>
                  <dt className="text-muted">PayPal sandbox account paid</dt>
                  <dd className="break-all font-medium">{bill.receiverEmail ?? "not configured"}</dd>
                </dl>
                <p className="mt-2 text-xs text-muted">In this sandbox demo each payee is mapped to a test account, so no real money moves.</p>
                {bill.riskLevel === "high" && (
                  <label className="mt-4 block text-sm font-medium text-high">
                    This bill is high risk. Type why you are overriding the flags.
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. I called the vendor on their known number and confirmed the new account" className="input mt-1 text-ink" />
                  </label>
                )}
              </>
            ) : (
              <>
                <h2 id="modal-title" className="text-lg font-semibold">
                  Reject this bill?
                </h2>
                <label className="mt-4 block text-sm font-medium">
                  Reason
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. Duplicate of a bill already paid" className="input mt-1" />
                </label>
              </>
            )}
            <label className="mt-4 block text-sm font-medium">
              Your name, recorded with the decision
              <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="e.g. Paul" className="input mt-1" />
            </label>
            {err && <p className="mt-3 text-sm text-high">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="btn" disabled={busy}>
                Cancel
              </button>
              <button
                disabled={busy || !actor.trim() || (modal === "reject" && !text.trim()) || (modal === "approve" && bill.riskLevel === "high" && !text.trim())}
                onClick={() =>
                  void (modal === "approve"
                    ? call("/approve", "POST", { actorName: actor, overrideReason: text || null, confirmAmountCents: bill.totalCents ?? undefined, confirmPayeeEmail: bill.payeeEmail })
                    : call("/reject", "POST", { actorName: actor, reason: text }))
                }
                className={`btn ${modal === "approve" ? "btn-primary" : "btn-danger"}`}
              >
                {busy ? "Working..." : modal === "approve" ? "Confirm and pay" : "Confirm reject"}
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
    <label className="text-xs font-medium text-muted">
      {p.label}
      {p.low && <span className="ml-1 text-med">(check this)</span>}
      <input
        value={v}
        disabled={p.disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() !== p.value && p.onCommit(v.trim())}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`input mt-1 ${p.low ? "border-med bg-med-soft" : ""}`}
      />
    </label>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function stamp(iso: string) {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

const LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  extracted: "Fields extracted",
  extraction_failed: "Extraction failed",
  extraction_retry: "Reading the file again",
  flagged: "Flagged for review",
  risk_assessed: "Risk checks ran",
  edited: "Fields edited",
  category_set: "Category set",
  vendor_confirmed: "Vendor added to file",
  approved: "Approved",
  rejected: "Rejected",
  payment_started: "Payment started",
  payout_error: "PayPal did not accept the payment",
  payout_created: "PayPal payout batch created",
  webhook_received: "PayPal webhook received",
  status_paid: "Paid",
  status_failed: "Payment failed",
  payout_refunded: "Payout refunded",
  sample_history: "Sample history",
};
const label = (a: string) => LABELS[a] ?? a.replace(/_/g, " ");

function summarize(a: { action: string; detail: Record<string, unknown> }): string {
  const d = a.detail;
  if (a.action === "sample_history") return "loaded by the demo; this payment was not sent to PayPal";
  if (a.action === "webhook_received") return String(d.eventType ?? "");
  if (a.action === "extracted") return `by ${String(d.model ?? "the model")}${d.cached ? " (cached for this file)" : ""}`;
  if (a.action === "risk_assessed") return `${String(d.level)} risk${Array.isArray(d.checks) && d.checks.length ? `: ${(d.checks as string[]).map((c) => CHECK_LABEL[c] ?? c).join(", ")}` : ""}`;
  if (a.action === "approved" || a.action === "rejected") return `by ${String(d.actorName ?? "the owner")}${d.reason ? `: ${String(d.reason)}` : ""}${d.overrideReason ? ` (override: ${String(d.overrideReason)})` : ""}`;
  if (a.action === "payment_started" && d.senderBatchId) return `request id ${String(d.senderBatchId)}`;
  if (a.action === "payout_error") return String(d.message ?? "");
  if (a.action === "status_paid" && d.sample) return "";
  if (d.payoutBatchId) return `batch ${String(d.payoutBatchId)}${d.itemStatus ? `, item ${String(d.itemStatus)}` : ""}`;
  if (a.action === "category_set") return String(d.category ?? "cleared");
  return "";
}
