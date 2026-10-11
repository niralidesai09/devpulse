import type { Metadata } from "next";
import { Mermaid } from "@/components/Mermaid";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { COMPONENTS_MAP } from "@/lib/componentsMap";

export const metadata: Metadata = { title: "Architecture" };

const STAGES = [
  ["Load config", "Active topics, keywords and enabled sources are read from Supabase at the start of every run (no redeploy needed). A snapshot is stored on the run."],
  ["Collect", "Four source adapters behind one interface. Each has timeouts, bounded retries (Retry-After honoured), rate-limit handling and reports succeeded / partial / failed. One failing source never stops the run."],
  ["Normalise + dedupe", "Every record becomes the same shape with its stable source id, original URL, publication time (UTC) and all matched keywords. Duplicates merge by (source, id), then by normalised URL."],
  ["Idempotent ingest", "A Postgres function inserts new discussions and refreshes known ones in one statement. Re-running a collection cannot inflate counts; new vs duplicate counts are recorded per source."],
  ["Analyse (Gemini Flash)", "Only unanalysed discussions are sent, 20 per call, as untrusted delimited data. Output must match a JSON schema (validated with Zod, one repair attempt). Quotes are verified verbatim by code. Failures keep raw data for retry."],
  ["Consolidate (Gemini Flash)", "New pain-point proposals are merged with each other and with existing pain points so the same underlying problem is counted once. Validated; falls back to exact-title grouping, never invented labels."],
  ["Metrics (code only)", "IST reporting weeks (Fri 00:00 → Fri 00:00), like-for-like source comparison, zero-baseline and small-sample rules, transparent signal score. The model never computes numbers."],
  ["Brief (Gemini Flash)", "The model receives an evidence pack with keys (P1, D3…) — no URLs. Every claim must cite keys; code maps them back to ids, drops unsupported claims and flags numbers it did not supply."],
  ["Store + deliver", "Report, metric snapshot and evidence links are stored immutably. Email via Resend is sent only if configured, and marked “sent” only with a provider id."],
];

const BOUNDARIES = [
  ["Browser", "Never talks to Supabase or Gemini. Receives server-rendered HTML; no secrets in client bundles (no NEXT_PUBLIC_ secrets besides the Supabase URL)."],
  ["Admin actions", "Topic edits, runs, report generation, exclusions and decisions require an HMAC-signed httpOnly session cookie (ADMIN_PASSCODE) checked on the server for every call."],
  ["Cron", "/api/cron/weekly requires Authorization: Bearer CRON_SECRET (sent by Vercel Cron). Constant-time comparison."],
  ["Database", "Row Level Security on every v2 table with no anon/authenticated policies; writes only through the service-role key on the server; ingest function not executable by public roles."],
  ["AI input", "External text is delimited, length-capped and declared untrusted in the system prompt; output is schema-validated and can only reference keys we created. It cannot run code or queries."],
  ["Rendering", "All text is rendered as React text (escaped). Outbound links are restricted to http(s) and open with rel=noopener noreferrer."],
];

export default function ArchitecturePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Architecture & components map"
        description="How data moves from public developer communities to the Friday brief. This diagram is generated from the same source as docs/COMPONENTS_MAP.md, and a unit test checks every table and route on it exists in the code."
      />
      <Card>
        <CardHeader title="Components map" />
        <CardBody>
          <Mermaid chart={COMPONENTS_MAP} />
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pipeline stages" description="collection → normalisation → deduplication → relevance → classification → aggregation → trends → synthesis → storage" />
          <CardBody>
            <ol className="space-y-3 text-sm">
              {STAGES.map(([t, d], i) => (
                <li key={t}>
                  <p className="font-medium">
                    <span className="tabular text-text-3">{i + 1}.</span> {t}
                  </p>
                  <p className="text-text-2">{d}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Security boundaries" />
          <CardBody>
            <ul className="space-y-3 text-sm">
              {BOUNDARIES.map(([t, d]) => (
                <li key={t}>
                  <p className="font-medium">{t}</p>
                  <p className="text-text-2">{d}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
