import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Groundswell",
  description: "Catch developer pain before it peaks: weekly intelligence on what developers struggle with in code review and CI/CD.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-[17px] font-semibold tracking-tight">Groundswell</span>
              <span className="hidden text-xs text-ink-3 sm:inline">Catch developer pain before it peaks</span>
            </Link>
            <nav className="-mx-2 flex gap-1 text-sm" aria-label="Main">
              <NavLink href="/">Brief</NavLink>
              <NavLink href="/#ask">Ask</NavLink>
              <NavLink href="/topics">Topics</NavLink>
              <NavLink href="/runs">Runs</NavLink>
              <NavLink href="/architecture">How it works</NavLink>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-3 sm:px-6">
            Live data from Hacker News, GitHub Issues, Stack Overflow and DEV.to · analysis by Google Gemini Flash · runs every Friday 8:00 AM IST
          </p>
        </footer>
      </body>
    </html>
  );
}
