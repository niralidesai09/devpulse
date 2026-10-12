"use client";

// Application sidebar: primary tasks first, configuration second, "how it
// works" last. On small screens it collapses into a top bar + drawer.

import {
  Activity,
  FileText,
  HeartPulse,
  Lightbulb,
  Menu,
  MessagesSquare,
  Network,
  Tags,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./ui";

type Item = { href: string; label: string; icon: LucideIcon };

const PRIMARY: Item[] = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/discussions", label: "Discussions", icon: MessagesSquare },
  { href: "/pain-points", label: "Pain Points", icon: TriangleAlert },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/reports", label: "Weekly Briefs", icon: FileText },
];
const SECONDARY: Item[] = [
  { href: "/topics", label: "Monitored Topics", icon: Tags },
  { href: "/health", label: "Sources & Data Health", icon: HeartPulse },
];
const FOOTER: Item[] = [{ href: "/architecture", label: "How it works", icon: Network }];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md">
      <span className="flex size-7 items-center justify-center rounded-[8px] bg-ink text-white">
        <Activity className="size-4" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Developer Pulse</span>
    </Link>
  );
}

function NavList({ items, pathname, onNavigate }: { items: Item[]; pathname: string | null; onNavigate?: () => void }) {
  const active = (href: string) => pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <ul className="grid gap-0.5">
      {items.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active(href) ? "page" : undefined}
            className={cx(
              "flex h-8 items-center gap-2.5 rounded-[var(--radius)] px-2.5 text-[14px] transition-colors duration-100",
              active(href) ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-sunken hover:text-ink",
            )}
          >
            <Icon aria-hidden className={cx("size-4 shrink-0", active(href) ? "text-accent" : "text-ink-3")} strokeWidth={1.75} />
            <span className="truncate">{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SidebarView({ pathname, health, admin }: { pathname: string | null; health: ReactNode; admin: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const body = (
    <>
      <nav aria-label="Main" className="grid gap-6">
        <NavList items={PRIMARY} pathname={pathname} onNavigate={() => setOpen(false)} />
        <div>
          <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">Configure</p>
          <NavList items={SECONDARY} pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      </nav>
      <div className="mt-auto grid gap-4 pt-6">
        <div className="px-2.5">{health}</div>
        <NavList items={FOOTER} pathname={pathname} onNavigate={() => setOpen(false)} />
        <div className="border-t border-line px-2.5 pt-3">{admin}</div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <div className="mb-7 px-2.5">
          <Logo />
        </div>
        {body}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button type="button" className="flex size-9 items-center justify-center rounded-[var(--radius)] text-ink-2 hover:bg-sunken" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="animate-pop absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-bg px-3 py-4 shadow-[var(--shadow-pop)]">
            <div className="mb-6 flex items-center justify-between px-2.5">
              <Logo />
              <button type="button" aria-label="Close navigation" className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-sunken" onClick={() => setOpen(false)}>
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {body}
          </div>
        </div>
      )}
    </>
  );
}

/** Active-route highlighting needs the URL, so this streams in; SidebarView with pathname=null is the static fallback. */
export function Sidebar(props: { health: ReactNode; admin: ReactNode }) {
  return <SidebarView pathname={usePathname()} {...props} />;
}
