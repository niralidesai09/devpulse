import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { AdminStatus } from "@/components/AdminStatus";
import { Nav, NavLinks } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Developer Community Pulse", template: "%s · Developer Community Pulse" },
  description:
    "Evidence-backed weekly intelligence on developer pain points in code review, CI/CD and developer workflows — collected from public communities and analysed with Gemini Flash.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="md:flex">
          <aside className="no-print sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between px-4 py-3 md:block md:px-4 md:py-4">
              <Link href="/" className="flex items-center gap-2">
                <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-accent" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h4l3-8 4 16 3-8h4" />
                </svg>
                <span className="text-sm font-semibold tracking-tight">Community Pulse</span>
              </Link>
              <div className="md:mt-3">
                <Suspense fallback={<span className="text-xs text-text-3">…</span>}>
                  <AdminStatus />
                </Suspense>
              </div>
            </div>
            <Suspense fallback={<NavLinks pathname={null} />}>
              <Nav />
            </Suspense>
          </aside>
          <main id="main" className="print-full mx-auto w-full min-w-0 max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
