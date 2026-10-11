"use client";

// Route-level error boundary: an actionable message instead of a blank page.

import { buttonClass, ErrorPanel } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <ErrorPanel
        title="This page failed to load"
        error={error.message || "Unexpected error"}
        hint={error.digest ? `Reference: ${error.digest} (search the server logs for it).` : undefined}
      />
      <button type="button" className={buttonClass("secondary")} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
