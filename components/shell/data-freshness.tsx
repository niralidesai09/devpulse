// Sidebar footer: how fresh the data is, from the real run history.
// "Fresh" only when the last run with data finished within 8 days AND the
// newest attempt did not fail; anything else says so plainly.

import Link from "next/link";
import { connection } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { daysSince, fmtAge, fmtDateTime, nextScheduledRun } from "@/lib/format";

export async function DataFreshness() {
  await connection();
  const supabase = createServerClient();
  const [{ data: lastGood }, { data: latest }] = await Promise.all([
    supabase
      .from("runs")
      .select("finished_at")
      .in("status", ["success", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("runs").select("status, started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const ageDays = daysSince(lastGood?.finished_at);
  const latestFailed = latest?.status === "failed";
  const running = latest?.status === "running";
  const fresh = ageDays <= 8 && !latestFailed;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-ink-2">
        <span aria-hidden className={`size-1.5 rounded-full ${fresh ? "bg-good" : "bg-warn"}`} />
        {lastGood?.finished_at ? (
          <span>
            Data from <time dateTime={lastGood.finished_at}>{fmtAge(lastGood.finished_at)}</time>
          </span>
        ) : (
          <span>No data collected yet</span>
        )}
      </p>
      {running && <p className="text-accent">A collection run is in progress.</p>}
      {latestFailed && (
        <p className="text-warn">
          The latest run failed. <Link href="/runs" className="underline">See Runs</Link>
        </p>
      )}
      <p>Next run {fmtDateTime(nextScheduledRun().toISOString())}</p>
      <p>
        AI-assisted analysis ·{" "}
        <Link href="/architecture" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
          how it works
        </Link>
      </p>
    </div>
  );
}
