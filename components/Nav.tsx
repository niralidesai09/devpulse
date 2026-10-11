"use client";

// Primary navigation. Client component only to highlight the active route.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Overview", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/pain-points", label: "Pain points", icon: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" },
  { href: "/opportunities", label: "Opportunities", icon: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" },
  { href: "/discussions", label: "Discussions", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" },
  { href: "/reports", label: "Reports", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h5" },
  { href: "/decisions", label: "Decisions", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { href: "/health", label: "Data health", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { href: "/settings", label: "Settings", icon: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" },
  { href: "/architecture", label: "Architecture", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Active-route highlighting needs the URL, so it streams in; NavLinks with no pathname is the static fallback. */
export function Nav() {
  return <NavLinks pathname={usePathname()} />;
}

export function NavLinks({ pathname }: { pathname: string | null }) {
  const isActive = (href: string) => (pathname === null ? false : href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav aria-label="Primary">
      {/* Desktop: vertical list. Mobile: horizontal scroller. */}
      <ul className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:overflow-visible md:px-2 md:pb-0">
        {ITEMS.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cx(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive(item.href) ? "bg-surface-3 font-medium text-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
