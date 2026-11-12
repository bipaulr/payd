/** Integer cents to "$1,234.50". Uses string and integer math only. */
export function usd(cents: number | null | undefined): string {
  if (cents == null) return "-";
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}$${whole}.${String(abs % 100).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO date or timestamp to "12 Nov 2026" (the one date format used everywhere). */
export function day(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const s = typeof iso === "string" ? iso : iso.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return "-";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const RISK: Record<string, string> = {
  low: "bg-ok-soft text-ok",
  medium: "bg-med-soft text-med",
  high: "bg-high-soft text-high",
};
const RISK_LABEL: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

export function RiskBadge({ level }: { level: string | null | undefined }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${level ? RISK[level] : "bg-surface-2 text-muted"}`}>
      {level === "high" && <span aria-hidden>!</span>}
      {level ? RISK_LABEL[level] : "Not assessed"}
    </span>
  );
}

const STATUS: Record<string, string> = {
  paid: "bg-ok-soft text-ok",
  paying: "bg-info-soft text-info",
  approved: "bg-info-soft text-info",
  failed: "bg-high-soft text-high",
  rejected: "bg-surface-2 text-muted",
  needs_review: "bg-med-soft text-med",
};
export const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  extracted: "Extracted",
  needs_review: "Needs review",
  approved: "Approved",
  paying: "Paying",
  paid: "Paid",
  failed: "Failed",
  rejected: "Rejected",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[status] ?? "bg-surface-2 text-muted"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const CHECK_LABEL: Record<string, string> = {
  duplicate: "Duplicate",
  payee_changed: "Payee changed",
  amount_anomaly: "Unusual amount",
  math_mismatch: "Math does not add up",
  lookalike_vendor: "Lookalike vendor",
  pressure_language: "Pressure language",
};
