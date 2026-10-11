// Shows whether this browser has an admin session. Server component (reads the cookie).

import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { logout } from "@/app/actions";

export async function AdminStatus() {
  const admin = await isAdmin();
  if (!admin) {
    return (
      <Link href="/login" className="text-xs text-text-2 hover:text-text">
        Viewing read-only · <span className="text-accent-text">Sign in to edit</span>
      </Link>
    );
  }
  return (
    <form action={logout} className="flex items-center gap-2 text-xs text-text-2">
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="size-1.5 rounded-full bg-good" /> Admin
      </span>
      <button type="submit" className="text-text-3 hover:text-text">
        Sign out
      </button>
    </form>
  );
}
