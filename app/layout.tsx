import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-figtree", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: "payD, the AI finance clerk",
  description: "payD reads any bill, flags fakes and duplicates, and pays through PayPal after a human approves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${bricolage.variable}`}>
      <body className="flex min-h-screen flex-col antialiased">
        <div className="swatches h-1.5" aria-hidden>
          <i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
        </div>
        <div className="bg-banner px-4 py-1.5 text-center text-sm font-semibold text-banner-ink" role="note">
          Sandbox demo. No real money moves.
        </div>
        <Sidebar />
        <main className="container-page w-full min-w-0 flex-1 py-8">{children}</main>
        <footer className="border-t border-line">
          <div className="container-page flex flex-wrap items-center justify-between gap-3 py-5 text-sm text-muted">
            <span>payD runs in the PayPal sandbox. Nothing is paid without a recorded human approval.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
