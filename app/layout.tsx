import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AdminStatus } from "@/components/AdminStatus";
import { FeedbackProvider } from "@/components/Feedback";
import { HealthIndicator } from "@/components/HealthIndicator";
import { Sidebar, SidebarView } from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Developer Pulse", template: "%s · Developer Pulse" },
  description: "Understand what developers are struggling with, and what your product should solve next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const health = (
    <Suspense fallback={<span className="text-[12px] text-ink-3">Checking data…</span>}>
      <HealthIndicator />
    </Suspense>
  );
  const admin = (
    <Suspense fallback={<span className="text-[13px] text-ink-3">…</span>}>
      <AdminStatus />
    </Suspense>
  );
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2 focus:shadow-[var(--shadow-pop)]">
          Skip to content
        </a>
        <FeedbackProvider>
          <div className="lg:flex">
            <Suspense fallback={<SidebarView pathname={null} health={health} admin={admin} />}>
              <Sidebar health={health} admin={admin} />
            </Suspense>
            <main id="main" className="print-full mx-auto w-full min-w-0 max-w-[1120px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
              {children}
            </main>
          </div>
        </FeedbackProvider>
      </body>
    </html>
  );
}
