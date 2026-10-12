"use client";
// App navigation. Desktop (lg+): a fixed left sidebar. Smaller screens: a
// slim top bar whose menu button opens the same list as a drawer.
// The current page is marked with aria-current and a filled row.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  History,
  LayoutGrid,
  Library,
  Menu,
  MessageSquareText,
  Tags,
  Target,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon };

const ANALYSIS: Item[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/evidence", label: "Evidence", icon: Library },
  { href: "/ask", label: "Ask", icon: MessageSquareText },
];
const SETUP: Item[] = [
  { href: "/topics", label: "Topics", icon: Tags },
  { href: "/runs", label: "Runs", icon: History },
  { href: "/architecture", label: "How it works", icon: BookOpenText },
];

/** The brand mark: three rising swell lines, drawn once, in the ink colour. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M3 17c3 0 4-2 6-2s3 2 6 2 4-2 6-2" opacity={0.45} />
      <path d="M3 12.5c3 0 4-3 6-3s3 3 6 3 4-3 6-3" opacity={0.7} />
      <path d="M3 8c3 0 4-4 6-4s3 4 6 4 4-4 6-4" />
    </svg>
  );
}

function NavList({ items, pathname, onNavigate }: { items: Item[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors duration-150 ${
                active ? "bg-surface font-medium text-ink shadow-[0_1px_0_var(--line)]" : "text-ink-2 hover:bg-surface/60 hover:text-ink"
              }`}
            >
              <Icon aria-hidden size={16} strokeWidth={1.75} className={active ? "text-accent" : "text-ink-3"} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ status }: { status: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer with Escape, and lock page scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const nav = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 px-3">
      <NavList items={ANALYSIS} pathname={pathname} onNavigate={() => setOpen(false)} />
      <div className="border-t border-line pt-4">
        <NavList items={SETUP} pathname={pathname} onNavigate={() => setOpen(false)} />
      </div>
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2 text-ink" onClick={() => setOpen(false)}>
      <BrandMark className="size-5 text-accent" />
      <span className="font-serif text-[18px] font-semibold tracking-[-0.01em]">Groundswell</span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-stock lg:flex">
        <div className="px-5 pt-5 pb-6">{brand}</div>
        {nav}
        <div className="border-t border-line px-5 py-4 text-[12px] leading-relaxed text-ink-3">{status}</div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-stock px-4 lg:hidden">
        {brand}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface hover:text-ink"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Open menu</span>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" id="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/25" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 flex w-[min(280px,85vw)] flex-col bg-stock shadow-[8px_0_24px_-12px_rgb(0_0_0/0.25)]">
            <div className="flex h-14 items-center justify-between px-4">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface hover:text-ink"
              >
                <X size={20} strokeWidth={1.75} aria-hidden />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto pt-3">{nav}</div>
            <div className="border-t border-line px-5 py-4 text-[12px] leading-relaxed text-ink-3">{status}</div>
          </div>
        </div>
      )}
    </>
  );
}
