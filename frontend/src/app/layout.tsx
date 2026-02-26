import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/AppSidebar";
import { AppTopBar } from "@/components/AppTopBar";
import { SanchoGlobal } from "@/components/sancho/SanchoGlobal";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SEO+GEO Partner",
  description: "SEO & GEO visibility analysis tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen bg-slate-50">
          <AppSidebar />
          <div className="flex flex-1 flex-col min-w-0">
            <AppTopBar />
            <main className="flex-1 overflow-auto px-8 py-8">
              {children}
            </main>
          </div>
        </div>
        <SanchoGlobal />
      </body>
    </html>
  );
}
