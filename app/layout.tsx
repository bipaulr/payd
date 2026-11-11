import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "payD",
  description: "AI finance clerk for small businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        <div className="bg-amber-100 px-4 py-1 text-center text-sm text-amber-900">
          Sandbox demo. No real money moves.
        </div>
        <div className="flex min-h-[calc(100vh-28px)]">
          <Sidebar />
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
