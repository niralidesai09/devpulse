// /architecture: how Groundswell works: diagram, data flow, every
// component and the service it uses (the Components Map), and how the
// exam's hard rules are met. Static page: no database reads.

import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Download } from "lucide-react";
import { COMPONENT_GROUPS } from "@/lib/components-map";

export const metadata: Metadata = { title: "How it works" };

function MapDownloads() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href="/groundswell-components-map.pdf"
        download
        className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-[13px] font-medium text-accent-ink hover:opacity-90"
      >
        <Download aria-hidden size={15} strokeWidth={1.75} />
        Components Map (PDF)
      </a>
      <a
        href="/groundswell-components-map.png"
        download
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        Image (PNG)
      </a>
      <a
        href="/groundswell-components-map.md"
        download
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        Detailed table
      </a>
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <main className="mx-auto max-w-[1200px] px-5 py-6 lg:px-10 lg:py-8">
      <PageHeader
        title="How Groundswell works"
        description={
          <p>
            Every Friday at 8:00 AM IST, Groundswell collects the last 7 days of developer discussions from four public communities (Hacker News,
            GitHub Issues, Stack Overflow and DEV.to; no other sites), has Google Gemini Flash classify them, computes trends and a relative
            Opportunity Score in code, and emails an evidence-linked brief before the engineering sync.
          </p>
        }
        actions={<MapDownloads />}
      />

      <figure className="mt-6 rounded-md border border-line bg-surface p-3 sm:p-4">
        <div className="overflow-x-auto">
          <Diagram />
        </div>
        <figcaption className="mt-2 text-xs text-ink-3">
          Arrows show data flow. Green AI boxes are the only places AI is used; numbers, trends and scores are computed by code.
        </figcaption>
      </figure>

      <section className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">One weekly run, step by step</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-2 marker:text-ink-3">
            <li><b className="font-medium text-ink">Load topics</b> and keywords from Supabase (editable on /topics, no code changes).</li>
            <li><b className="font-medium text-ink">Collect</b> posts from Hacker News, Stack Overflow, GitHub Issues and DEV.to in parallel; dedupe by URL; keep the 300 most-engaged. A failing source never stops the run.</li>
            <li><b className="font-medium text-ink">Classify</b> with AI in batches of 25: topic (or &quot;other&quot; / irrelevant), pain point, unresolved + evidence, sentiment, severity, competitors. <i>At the same time</i>, count Hacker News keyword matches for this week and last week (the smart baseline).</li>
            <li><b className="font-medium text-ink">Score</b> each topic in code: mentions (all sources), Hacker News keyword trend (with counts; &quot;too few to compare&quot; under 5 matches), unresolved share, severity → relative Opportunity Score 0–100.</li>
            <li><b className="font-medium text-ink">Radar</b>: the AI groups &quot;other&quot; posts into suggested new topics; Sumit approves or rejects them.</li>
            <li><b className="font-medium text-ink">Brief</b>: the AI writes the commentary for the brief using only the computed numbers; every claim links to a real thread.</li>
            <li><b className="font-medium text-ink">Email</b> it with Resend and show everything on the dashboard. The run is marked success, partial or failed per source.</li>
          </ol>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Exam rules, and how they are met</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <Rule title="Gemini Flash only">Every AI call goes through lib/ai/gemini.ts with the official @google/genai SDK; the model comes from GEMINI_MODEL (gemini-3.8-flash). No other AI provider is installed.</Rule>
            <Rule title="Live external data">Four public APIs are queried on every run; nothing is mocked. Each run records which sources worked.</Rule>
            <Rule title="Topics in Supabase">Topics and keywords live in the topics table; add, edit or pause them on /topics, or approve radar suggestions.</Rule>
            <Rule title="Vercel + Friday cron">Deployed on Vercel; vercel.json schedules /api/cron/weekly at 30 2 * * 5 (Friday 08:00 IST).</Rule>
            <Rule title="Secrets in env vars only">Keys live in Vercel environment variables and a git-ignored .env.local; only .env.example (empty values) is committed.</Rule>
          </ul>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="components-heading">
        <h2 id="components-heading" className="text-sm font-semibold">
          Components map
        </h2>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">Every component, what it does, and the service it uses</p>
          <MapDownloads />
        </div>
        <div className="mt-3 space-y-6">
          {COMPONENT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[13px] font-semibold text-ink">{group.title}</h3>
              <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2">
                {group.items.map((c) => (
                  <li key={c.name} className="rounded-md border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-accent">{c.service}</p>
                    </div>
                    <p className="mt-1 text-sm text-ink-2">{c.does}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-3" title={c.file}>
                      {c.file}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <p className="font-medium text-ink">✓ {title}</p>
      <p className="mt-0.5">{children}</p>
    </li>
  );
}

// ---------------------------------------------------------------------
// The diagram (inline SVG, themed with the same CSS variables as the app).
// ---------------------------------------------------------------------
type Kind = "ai" | "external" | "code" | "data";

const FILL: Record<Kind, string> = {
  ai: "var(--accent-soft)",
  external: "var(--surface-2)",
  code: "var(--surface)",
  data: "var(--surface)",
};
const STROKE: Record<Kind, string> = {
  ai: "var(--accent)",
  external: "var(--line)",
  code: "var(--ink-3)",
  data: "var(--ink-2)",
};

function Box({ x, y, w, h, title, sub, kind }: { x: number; y: number; w: number; h: number; title: string; sub?: string; kind: Kind }) {
  const lines = sub ? 2 : 1;
  const top = y + h / 2 - (lines === 2 ? 8 : -4);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={FILL[kind]} stroke={STROKE[kind]} strokeWidth={kind === "data" ? 1.5 : 1} />
      <text x={x + w / 2} y={top} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--ink)">
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={top + 17} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
          {sub}
        </text>
      )}
    </g>
  );
}

const Arrow = ({ d }: { d: string }) => <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth={1.4} markerEnd="url(#arrowhead)" />;

function Diagram() {
  return (
    <svg viewBox="0 0 1000 590" className="h-auto w-full min-w-[860px]" role="img" aria-labelledby="diagram-title diagram-desc" fontFamily="var(--font-plex-sans), system-ui, sans-serif">
      <title id="diagram-title">Groundswell architecture</title>
      <desc id="diagram-desc">
        Vercel Cron or the Run now button starts the weekly pipeline. Four live sources feed collection; the AI model (Gemini Flash) classifies posts;
        code computes trends and scores; the AI finds emerging topics and writes the brief commentary; Resend emails it; everything is saved in Supabase
        and shown on the Vercel dashboard. Ask the Pulse searches stored posts in Supabase and the AI answers with citations.
      </desc>
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-3)" />
        </marker>
      </defs>

      {/* Legend */}
      <g fontSize={11} fill="var(--ink-2)">
        <rect x={740} y={18} width={14} height={14} rx={3} fill={FILL.ai} stroke={STROKE.ai} />
        <text x={760} y={29}>AI step (Gemini Flash)</text>
        <rect x={740} y={40} width={14} height={14} rx={3} fill={FILL.external} stroke={STROKE.external} />
        <text x={760} y={51}>External service</text>
        <rect x={880} y={18} width={14} height={14} rx={3} fill={FILL.code} stroke={STROKE.code} />
        <text x={900} y={29}>Our code</text>
        <rect x={880} y={40} width={14} height={14} rx={3} fill={FILL.data} stroke={STROKE.data} strokeWidth={1.5} />
        <text x={900} y={51}>Database</text>
      </g>

      {/* Triggers */}
      <Box x={250} y={16} w={210} h={48} title="Vercel Cron" sub="Fridays 02:30 UTC = 08:00 IST" kind="external" />
      <Box x={490} y={16} w={200} h={48} title="Run now" sub="dashboard · admin passcode" kind="code" />
      <Arrow d="M355,64 L355,98" />
      <Arrow d="M590,64 L590,98" />

      {/* Live sources */}
      <text x={20} y={110} fontSize={11} fontWeight={600} letterSpacing="0.06em" fill="var(--ink-3)">LIVE SOURCES</text>
      <Box x={20} y={120} w={160} h={44} title="Hacker News" sub="Algolia API" kind="external" />
      <Box x={20} y={172} w={160} h={44} title="Stack Overflow" sub="Stack Exchange API" kind="external" />
      <Box x={20} y={224} w={160} h={44} title="GitHub Issues" sub="Search API" kind="external" />
      <Box x={20} y={276} w={160} h={44} title="DEV.to" sub="Forem API" kind="external" />
      <Arrow d="M180,142 L218,170" />
      <Arrow d="M180,194 L218,174" />
      <Arrow d="M180,246 L218,178" />
      <Arrow d="M180,298 L218,182" />

      {/* Pipeline container */}
      <rect x={200} y={100} width={590} height={290} rx={14} fill="none" stroke="var(--line)" strokeDasharray="5 4" />
      <text x={216} y={124} fontSize={11} fontWeight={600} letterSpacing="0.06em" fill="var(--ink-3)">
        WEEKLY PIPELINE · runPipeline() · one Vercel Function, about 2 min
      </text>

      <Box x={220} y={140} w={170} h={66} title="1 Collect & dedupe" sub="topics from Supabase" kind="code" />
      <Box x={410} y={140} w={170} h={66} title="2 Classify" sub="AI · 25 per batch" kind="ai" />
      <Box x={600} y={140} w={170} h={66} title="3 Trend & score" sub="HN baseline · 0–100" kind="code" />
      <Arrow d="M390,173 L408,173" />
      <Arrow d="M580,173 L598,173" />
      <Arrow d="M685,206 L685,246 L305,246 L305,288" />
      <text x={495} y={240} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">save posts + topic stats</text>

      <Box x={220} y={290} w={170} h={66} title="4 Emerging radar" sub="AI · new topics" kind="ai" />
      <Box x={410} y={290} w={170} h={66} title="5 Write brief" sub="AI text · real links" kind="ai" />
      <Box x={600} y={290} w={170} h={66} title="6 Email" sub="Resend" kind="external" />
      <Arrow d="M390,323 L408,323" />
      <Arrow d="M580,323 L598,323" />

      {/* Inbox */}
      <Box x={820} y={290} w={160} h={66} title="Sumit's inbox" sub="Friday 8 AM brief" kind="external" />
      <Arrow d="M770,323 L818,323" />

      {/* Database */}
      <Arrow d="M495,390 L495,418" />
      <Box
        x={200}
        y={420}
        w={590}
        h={60}
        title="Supabase Postgres"
        sub="topics · runs · posts (+ full-text index) · topic_stats · briefs · suggested_topics"
        kind="data"
      />

      {/* Dashboard */}
      <Box x={820} y={410} w={160} h={80} title="Dashboard" sub="Next.js on Vercel" kind="code" />
      <path d="M792,450 L818,450" fill="none" stroke="var(--ink-3)" strokeWidth={1.4} markerStart="url(#arrowhead)" markerEnd="url(#arrowhead)" />
      <text x={890} y={506} textAnchor="end" fontSize={10.5} fill="var(--ink-3)">reads data · edits topics · approves radar</text>

      {/* Ask the Pulse */}
      <text x={20} y={546} fontSize={11} fontWeight={600} letterSpacing="0.06em" fill="var(--ink-3)">ASK THE PULSE</text>
      <Box x={200} y={522} w={130} h={48} title="Question" sub="from the dashboard" kind="code" />
      <Box x={350} y={522} w={130} h={48} title="/api/ask" sub="validate · rate limit" kind="code" />
      <Box x={500} y={522} w={150} h={48} title="search_posts()" sub="Postgres full-text" kind="data" />
      <Box x={670} y={522} w={150} h={48} title="AI answer" sub="only from found posts" kind="ai" />
      <Arrow d="M330,546 L348,546" />
      <Arrow d="M480,546 L498,546" />
      <Arrow d="M650,546 L668,546" />
      <Arrow d="M820,546 L900,546 L900,492" />
    </svg>
  );
}
