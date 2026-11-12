"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellClickedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type GridApi,
  type GridState,
  type ICellRendererParams,
  type IRowNode,
  type StateUpdatedEvent,
  type ValueFormatterParams,
} from "ag-grid-community";
import { day, RiskBadge, STATUS_LABEL, StatusBadge, usd } from "./badges";

ModuleRegistry.registerModules([AllCommunityModule]);

interface ApiBill {
  id: string;
  fileName: string;
  status: string;
  riskLevel: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  totalCents: number | null;
  category: string | null;
  proposedVendorName: string | null;
  vendor: { name: string } | null;
  payout: { payoutBatchId: string | null } | null;
}

interface Row {
  id: string;
  vendor: string;
  invoiceNumber: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  totalCents: number | null;
  status: string;
  riskLevel: string | null;
  paidAt: Date | null;
  batchId: string | null;
  category: string | null;
  /** True only for the pinned totals row. */
  isTotal?: boolean;
}

/** Dates are compared as calendar days in UTC, the way the bill prints them. */
const toDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00.000Z`) : null);
const toRow = (b: ApiBill): Row => ({
  id: b.id,
  vendor: b.vendor?.name ?? b.proposedVendorName ?? b.fileName,
  invoiceNumber: b.invoiceNumber,
  issueDate: toDate(b.issueDate),
  dueDate: toDate(b.dueDate),
  totalCents: b.totalCents,
  status: b.status,
  riskLevel: b.riskLevel,
  paidAt: toDate(b.paidAt),
  batchId: b.payout?.payoutBatchId ?? null,
  category: b.category,
});

type View = "all" | "needs_review" | "due_week" | "paid_month" | "flagged";
const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All bills" },
  { key: "needs_review", label: "Needs review" },
  { key: "due_week", label: "Due this week" },
  { key: "paid_month", label: "Paid this month" },
  { key: "flagged", label: "Flagged" },
];

function inView(view: View, r: Row, now: Date): boolean {
  switch (view) {
    case "needs_review":
      return r.status === "needs_review";
    case "due_week": {
      if (!r.dueDate || ["paid", "rejected", "failed"].includes(r.status)) return false;
      const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      return r.dueDate.getTime() >= start - 86_400_000 * 0 && r.dueDate.getTime() < start + 7 * 86_400_000;
    }
    case "paid_month":
      return r.status === "paid" && !!r.paidAt && r.paidAt.getUTCFullYear() === now.getFullYear() && r.paidAt.getUTCMonth() === now.getMonth();
    case "flagged":
      return r.riskLevel === "medium" || r.riskLevel === "high";
    default:
      return true;
  }
}

const STATE_KEY = "payd.ledger.columns.v1";
function savedState(): GridState | undefined {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as GridState) : undefined;
  } catch {
    return undefined;
  }
}

const dateFmt = (p: ValueFormatterParams<Row, Date | null>) => (p.value ? day(p.value) : "");
const dateCsv = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const centsCsv = (c: number | null) => (c == null ? "" : `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`);

export default function LedgerGrid() {
  const router = useRouter();
  const apiRef = useRef<GridApi<Row> | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [quick, setQuick] = useState("");
  const [totals, setTotals] = useState<Row[]>([]);
  const [initialState] = useState<GridState | undefined>(savedState);
  const viewRef = useRef<View>("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bills", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setRows(((await res.json()) as { bills: ApiBill[] }).bills.map(toRow));
      setError(null);
    } catch {
      setError("Could not load the ledger. Check that the server and database are running.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // The grid reads the app's own tokens (app/globals.css), so it follows light and dark with the page.
  const theme = useMemo(
    () =>
      themeQuartz.withParams({
        backgroundColor: "var(--surface)",
        foregroundColor: "var(--ink)",
        headerBackgroundColor: "var(--surface-2)",
        borderColor: "var(--line)",
        accentColor: "var(--accent)",
        browserColorScheme: "inherit",
        fontFamily: "inherit",
        fontSize: 14,
        wrapperBorderRadius: 8,
      }),
    [],
  );

  const columns = useMemo<ColDef<Row>[]>(
    () => [
      { field: "vendor", headerName: "Vendor", filter: "agTextColumnFilter", minWidth: 190, flex: 1.4 },
      { field: "invoiceNumber", headerName: "Invoice", filter: "agTextColumnFilter", width: 140 },
      { field: "issueDate", headerName: "Issued", filter: "agDateColumnFilter", valueFormatter: dateFmt, width: 125 },
      { field: "dueDate", headerName: "Due", filter: "agDateColumnFilter", valueFormatter: dateFmt, width: 125 },
      {
        field: "totalCents",
        headerName: "Total (USD)",
        type: "rightAligned",
        width: 135,
        // Filter in dollars; the stored value stays integer cents.
        filter: "agNumberColumnFilter",
        filterValueGetter: (p) => (p.data?.totalCents == null ? null : p.data.totalCents / 100),
        valueFormatter: (p) => usd(p.value as number | null),
        cellClass: "money",
      },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        filter: "agTextColumnFilter",
        filterValueGetter: (p) => (p.data ? (STATUS_LABEL[p.data.status] ?? p.data.status) : ""),
        cellRenderer: (p: ICellRendererParams<Row>) => (p.data?.isTotal ? null : <StatusBadge status={String(p.value)} />),
      },
      {
        field: "riskLevel",
        headerName: "Risk",
        width: 135,
        filter: "agTextColumnFilter",
        comparator: (a: string | null, b: string | null) => ["low", "medium", "high"].indexOf(a ?? "") - ["low", "medium", "high"].indexOf(b ?? ""),
        cellRenderer: (p: ICellRendererParams<Row>) => (p.data?.isTotal ? null : <RiskBadge level={p.value as string | null} />),
      },
      { field: "paidAt", headerName: "Paid", filter: "agDateColumnFilter", valueFormatter: dateFmt, width: 125 },
      { field: "batchId", headerName: "PayPal batch id", filter: "agTextColumnFilter", width: 165, cellClass: "font-mono text-xs" },
      {
        field: "category",
        headerName: "Category, click to edit",
        filter: "agTextColumnFilter",
        minWidth: 170,
        flex: 1,
        editable: (p) => !p.data?.isTotal,
        cellEditor: "agTextCellEditor",
        cellEditorParams: { maxLength: 60 },
        valueFormatter: (p) => (p.data?.isTotal ? "" : ((p.value as string | null) ?? "")),
        cellClass: (p) => (p.data?.isTotal ? "" : "cursor-text"),
      },
    ],
    [],
  );

  const recount = useCallback((api: GridApi<Row>) => {
    let sum = 0;
    let count = 0;
    api.forEachNodeAfterFilter((n: IRowNode<Row>) => {
      if (!n.data) return;
      count++;
      sum += n.data.totalCents ?? 0;
    });
    const label = `${count} ${count === 1 ? "bill" : "bills"} shown`;
    // Keep the same array when nothing changed. A new array re-renders the grid, which fires
    // onModelUpdated again; that loop never settles and blocks navigation away from the page.
    setTotals((prev) => prev[0] && prev[0].vendor === label && prev[0].totalCents === sum ? prev : [{ id: "__total", vendor: label, invoiceNumber: null, issueDate: null, dueDate: null, totalCents: sum, status: "", riskLevel: null, paidAt: null, batchId: null, category: null, isTotal: true }]);
  }, []);

  const choose = (v: View) => {
    viewRef.current = v;
    setView(v);
    apiRef.current?.onFilterChanged();
  };

  async function onCategory(e: CellValueChangedEvent<Row>) {
    if (e.colDef.field !== "category" || !e.data || e.data.isTotal) return;
    const next = typeof e.newValue === "string" && e.newValue.trim() ? e.newValue.trim() : null;
    try {
      const res = await fetch(`/api/bills/${e.data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: next }) });
      if (!res.ok) throw new Error();
      setNotice(`Saved category for ${e.data.vendor}.`);
    } catch {
      // Put the old value back so the grid never shows something that was not saved.
      e.node.setData({ ...e.data, category: (e.oldValue as string | null) ?? null });
      setNotice("Could not save the category. The old value was restored.");
    }
  }

  function exportCsv() {
    apiRef.current?.exportDataAsCsv({
      fileName: `payd-ledger-${view}-${new Date().toISOString().slice(0, 10)}.csv`,
      skipPinnedBottom: true,
      processCellCallback: (p) => {
        const f = p.column.getColDef().field;
        if (f === "totalCents") return centsCsv(p.value as number | null);
        if (f === "issueDate" || f === "dueDate" || f === "paidAt") return dateCsv(p.value as Date | null);
        if (f === "status") return STATUS_LABEL[String(p.value)] ?? String(p.value ?? "");
        return p.value == null ? "" : String(p.value);
      },
    });
  }

  function resetColumns() {
    try {
      window.localStorage.removeItem(STATE_KEY);
    } catch {
      // ignore
    }
    apiRef.current?.resetColumnState();
    apiRef.current?.setFilterModel(null);
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[32rem] flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Ledger</h1>
          <p className="mt-1 text-sm text-muted">Every bill and what happened to it. Click a row to open the bill.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="search" name="q" autoComplete="off" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Search vendor, invoice, batch id…" aria-label="Search the ledger" className="input w-72" />
          <button className="btn" onClick={exportCsv} disabled={!rows?.length}>
            Export CSV
          </button>
          <button className="btn" onClick={resetColumns} title="Restore the default column order, widths and filters">
            Reset columns
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Saved views">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => choose(v.key)} aria-pressed={view === v.key} className={`btn ${view === v.key ? "border-accent bg-accent-soft" : ""}`}>
            {v.label}
          </button>
        ))}
        {notice && (
          <span className="ml-2 text-sm text-muted" role="status">
            {notice}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-(--radius) bg-high-soft px-3 py-2 text-sm text-high" role="alert">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      <div className="mt-3 min-h-0 flex-1">
        <AgGridReact<Row>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, filter: true, floatingFilter: false }}
          getRowId={(p) => p.data.id}
          initialState={initialState}
          quickFilterText={quick}
          isExternalFilterPresent={() => viewRef.current !== "all"}
          doesExternalFilterPass={(n) => (n.data ? inView(viewRef.current, n.data, new Date()) : true)}
          pinnedBottomRowData={totals}
          getRowStyle={(p) => (p.node.rowPinned ? { fontWeight: 600 } : undefined)}
          rowClass="cursor-pointer"
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          suppressCellFocus={false}
          overlayNoRowsTemplate={rows && rows.length === 0 ? "No bills yet. Load the sample data on the Demo page, or upload a bill in the Inbox." : "No bills match this view."}
          onGridReady={(e) => {
            apiRef.current = e.api;
          }}
          onModelUpdated={(e) => recount(e.api)}
          onCellValueChanged={(e) => void onCategory(e)}
          onCellClicked={(e: CellClickedEvent<Row>) => {
            if (e.node.rowPinned || !e.data || e.colDef.field === "category") return;
            router.push(`/bills/${e.data.id}`);
          }}
          onStateUpdated={(e: StateUpdatedEvent<Row>) => {
            // Remember column order, width, visibility and sort between visits.
            const { columnOrder, columnSizing, columnVisibility, sort } = e.state;
            try {
              window.localStorage.setItem(STATE_KEY, JSON.stringify({ columnOrder, columnSizing, columnVisibility, sort }));
            } catch {
              // storage unavailable: the grid still works
            }
          }}
        />
      </div>
    </div>
  );
}
