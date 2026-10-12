import type { Metadata } from "next";
import { Libre_Franklin, Source_Code_Pro, Source_Serif_4 } from "next/font/google";
import { Suspense } from "react";
import { DataFreshness } from "@/components/shell/data-freshness";
import { Sidebar } from "@/components/shell/sidebar";
import "./globals.css";

// Interface: Libre Franklin (a workhorse catalogue grotesque).
// Editorial statements and page titles: Source Serif 4.
// Record ids and aligned figures only: Source Code Pro.
const franklin = Libre_Franklin({ variable: "--font-franklin", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], weight: ["400", "600"] });
const mono = Source_Code_Pro({ variable: "--font-source-code", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Groundswell", template: "%s · Groundswell" },
  description: "Catch developer pain before it peaks: weekly intelligence on what developers struggle with in code review and CI/CD.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${franklin.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <div className="lg:flex">
          <Sidebar
            status={
              <Suspense fallback={<p>Checking data freshness…</p>}>
                <DataFreshness />
              </Suspense>
            }
          />
          <div id="main" className="min-w-0 flex-1">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
