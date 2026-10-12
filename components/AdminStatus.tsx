// Sign-in state for the sidebar footer. Server component (reads the session cookie).

import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/actions";
import { isAdmin } from "@/lib/auth";

export async function AdminStatus() {
  const admin = await isAdmin();
  if (!admin) {
    return (
      <Link href="/login" className="flex items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
        <LogIn className="size-4 text-ink-3" aria-hidden strokeWidth={1.75} />
        Sign in to make changes
      </Link>
    );
  }
  return (
    <form action={logout} className="flex items-center justify-between gap-2 text-[13px]">
      <span className="text-ink-2">Signed in as admin</span>
      <button type="submit" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink" title="Sign out">
        <LogOut className="size-4" aria-hidden strokeWidth={1.75} />
        <span className="sr-only">Sign out</span>
      </button>
    </form>
  );
}
