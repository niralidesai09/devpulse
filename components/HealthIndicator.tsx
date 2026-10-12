// Compact data-health line for the sidebar: last collection and whether any source failed.

import Link from "next/link";
import { connection } from "next/server";
import { listRuns } from "@/lib/db/runs";
import { fmtRelative } from "@/lib/format";
import { StatusDot } from "./ui";

type Summary = { tone: "ok" | "warn" | "bad" | "idle"; text: string; sub: string } | null;

async function summarise(): Promise<Summary> {
  try {
    const runs = await listRuns(5);
    const running = runs.find((r) => r.status === "running");
    const lastGood = runs.find((r) => r.status === "succeeded" || r.status === "partial");
    const latest = runs.find((r) => r.status !== "running");
    const degraded = latest?.source_runs.filter((s) => s.status === "failed" || s.status === "partial").length ?? 0;
    const stale = !lastGood || Date.now() - new Date(lastGood.finished_at ?? lastGood.started_at).getTime() > 8 * 86_400_000;
    return {
      tone: running ? "warn" : latest?.status === "failed" ? "bad" : stale || degraded ? "warn" : "ok",
      text: running ? "Collecting now…" : lastGood ? `Updated ${fmtRelative(lastGood.finished_at)}` : "No data collected yet",
      sub:
        latest?.status === "failed"
          ? "Last collection failed"
          : degraded
            ? `${degraded} source${degraded > 1 ? "s" : ""} partly working`
            : stale && lastGood
              ? "Data is over a week old"
              : "All sources working",
    };
  } catch {
    return null;
  }
}

export async function HealthIndicator() {
  await connection();
  const s = await summarise();
  if (!s) {
    return (
      <span className="flex items-center gap-2 text-[12px] text-ink-3">
        <StatusDot tone="idle" /> Status unavailable
      </span>
    );
  }
  return (
    <Link href="/health" className="group block rounded-[var(--radius)] text-[12px] leading-[18px]">
      <span className="flex items-center gap-2 font-medium text-ink-2 group-hover:text-ink">
        <StatusDot tone={s.tone} /> {s.text}
      </span>
      <span className="block pl-4 text-ink-3">{s.sub}</span>
    </Link>
  );
}
