/**
 * Dev-only seed: 40 ledger rows (five invented vendors, 35 paid history bills
 * and the five demo inbox bills). It is the same loader as the Demo page.
 * Run: npm run db:seed    WARNING: this deletes all existing bills first.
 */
import "dotenv/config";
import { loadDemo } from "@/lib/demo/load";
import { db } from "@/lib/db";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("db:seed is for development only. Use the Demo page on a hosted instance.");
    process.exit(1);
  }
  const res = await loadDemo();
  // Give the background model pass a moment, then exit regardless.
  await new Promise((r) => setTimeout(r, 500));
  console.log(`Seeded ${res.vendors} vendors, ${res.historyBills} paid history bills and ${res.bills.length} inbox bills (${await db.bill.count()} rows).`);
  for (const b of res.bills) console.log(`  ${b.kind.padEnd(9)} ${b.riskLevel?.padEnd(6)} ${b.vendor}  ${b.flags.map((f) => f.check).join(", ") || "no flags"}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
