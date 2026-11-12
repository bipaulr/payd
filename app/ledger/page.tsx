"use client";

import dynamic from "next/dynamic";

// The grid reads localStorage and the colour scheme, so it renders in the browser only.
const LedgerGrid = dynamic(() => import("@/components/LedgerGrid"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted">Loading the ledger...</p>,
});

export default function Page() {
  return <LedgerGrid />;
}
