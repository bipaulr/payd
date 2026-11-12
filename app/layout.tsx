import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "payD: the AI finance clerk",
  description: "Reads any bill, flags fakes and duplicates, and pays through PayPal after a human approves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="rainbow h-1.5" aria-hidden />
        <div className="bg-banner px-4 py-1.5 text-center text-sm font-medium text-banner-ink" role="note">
          Sandbox demo. No real money moves.
        </div>
        <div className="flex min-h-[calc(100vh-38px)]">
          <Sidebar />
          <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
