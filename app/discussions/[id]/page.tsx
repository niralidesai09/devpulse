// One discussion: what the author wrote (left) vs. how the model interpreted
// it (right), with the reasoning behind every field and recurrence evidence.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ExcludeButton } from "@/components/ExcludeButton";
import { AiBadge, Badge, Callout, Card, CardBody, CardHeader, ErrorPanel, PageHeader, SourceBadge, SourceLink } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { getDiscussion, getRelatedDiscussions } from "@/lib/db/discussions";
import { safeLoad } from "@/lib/db/safe";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Discussion" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[150px_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-text-3">{label}</dt>
      <dd className="text-sm text-text-2">{children}</dd>
    </div>
  );
}

export default async function DiscussionPage(props: PageProps<"/discussions/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [admin, loaded] = await Promise.all([
    isAdmin(),
    safeLoad(async () => {
      const d = await getDiscussion(id);
      const related = d?.analysis?.pain_point_id ? await getRelatedDiscussions(d.analysis.pain_point_id, d.id) : [];
      return { d, related };
    }),
  ]);
  if (!loaded.ok) return <ErrorPanel title="Could not load this discussion" error={loaded.error} />;
  const { d, related } = loaded.data;
  if (!d) notFound();
  const a = d.analysis;
  const s = d.signals as { kind?: string; isOpen?: boolean; hasAcceptedAnswer?: boolean; isAnswered?: boolean; repo?: string; parentTitle?: string };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/discussions" className="hover:underline">
            ← Source explorer
          </Link>
        }
        title={d.title}
        actions={admin && <ExcludeButton id={d.id} excluded={d.is_excluded} />}
      />
      {d.is_excluded && (
        <Callout tone="warn" title="Excluded from analysis">
          {d.exclusion_reason ?? "No reason given"} · {fmtDateTime(d.excluded_at)}. It is not counted in metrics or used as evidence in new reports.
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="What the author wrote" description="Verbatim from the source (HTML removed; long texts trimmed around the matched keyword)." />
          <CardBody className="space-y-4">
            <dl className="space-y-2">
              <Row label="Source">
                <SourceBadge source={d.source_id} /> {s.kind && <span className="text-text-3">· {s.kind}</span>}
                {s.repo && <span className="text-text-3"> · {s.repo}</span>}
              </Row>
              <Row label="Original">
                <SourceLink href={d.url} className="break-all text-accent-text">
                  {d.url}
                </SourceLink>
              </Row>
              <Row label="Author">{d.author ?? "not available"}</Row>
              <Row label="Published">{fmtDateTime(d.published_at)}</Row>
              <Row label="Retrieved">
                first {fmtDateTime(d.first_retrieved_at)} · last {fmtDateTime(d.last_retrieved_at)}
              </Row>
              <Row label="Engagement">
                <span className="tabular">
                  {d.score ?? 0} points/votes · {d.comment_count ?? 0} {s.kind === "question" ? "answers" : "comments"}
                </span>
              </Row>
              <Row label="Source signals">
                {[
                  s.isOpen !== undefined && (s.isOpen ? "GitHub issue open" : "GitHub issue closed"),
                  s.hasAcceptedAnswer !== undefined && (s.hasAcceptedAnswer ? "accepted answer" : "no accepted answer"),
                  s.parentTitle && `comment on “${s.parentTitle}”`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "none"}
              </Row>
              <Row label="Matched keywords">
                <span className="flex flex-wrap gap-1">
                  {d.matched_keywords.map((k) => (
                    <Badge key={k}>{k}</Badge>
                  ))}
                </span>
              </Row>
            </dl>
            {d.excerpt ? (
              <blockquote className="whitespace-pre-line border-l-2 border-border-strong pl-3 text-sm text-text-2">{d.excerpt}</blockquote>
            ) : (
              <p className="text-sm text-text-3">No body text (title-only).</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2">Model interpretation <AiBadge /></span>}
            description={a ? `${a.model} · prompt ${a.prompt_version} · ${fmtDateTime(a.analyzed_at)}` : undefined}
          />
          <CardBody>
            {!a ? (
              <p className="text-sm text-text-3">
                {d.analysis_status === "failed"
                  ? `Analysis failed after ${d.analysis_attempts} attempt(s): ${d.analysis_error ?? "unknown error"}. It will be retried by the next run.`
                  : "Not analysed yet. It will be analysed by the next collection run."}
              </p>
            ) : (
              <dl className="space-y-2.5">
                <Row label="Relevant?">
                  <Badge tone={a.is_relevant ? "good" : "neutral"}>{a.is_relevant ? "Relevant" : "Not relevant"}</Badge> {a.relevance_reason}
                </Row>
                {a.is_relevant && (
                  <>
                    <Row label="Topic">{a.topic?.name ?? "—"}</Row>
                    <Row label="Pain point">
                      {a.pain_point ? (
                        <Link href={`/pain-points/${a.pain_point.id}`} className="text-accent-text hover:underline">
                          {a.pain_point.title}
                        </Link>
                      ) : (
                        "Not grouped yet"
                      )}
                    </Row>
                    <Row label="Problem (paraphrase)">{a.problem_summary ?? "—"}</Row>
                    <Row label="Supporting quote">
                      {a.evidence_quote && a.quote_verified ? (
                        <>
                          “{a.evidence_quote}” <Badge tone="good" title="Found verbatim in the source text by code">verified verbatim</Badge>
                        </>
                      ) : (
                        <span className="text-text-3">None (the model gave no quote, or it could not be found verbatim and was discarded)</span>
                      )}
                    </Row>
                    <Row label="Unresolved?">
                      {a.is_unresolved === null ? "—" : a.is_unresolved ? "Yes" : "No"} — {a.unresolved_evidence ?? "no evidence given"}
                    </Row>
                    <Row label="Workaround">{a.workaround ?? "None described"}</Row>
                    <Row label="Tools named">{a.tools_mentioned.length ? a.tools_mentioned.join(", ") : "None"}</Row>
                    <Row label="Criticises a tool?">{a.tool_dissatisfaction ? "Yes" : "No"}</Row>
                    <Row label="Frustration">{a.frustration ?? "—"} <span className="text-xs text-text-3">(judged from wording, not measured)</span></Row>
                    <Row label="Severity">{a.severity ? `${a.severity} / 5` : "—"} <span className="text-xs text-text-3">(1 annoyance … 5 outages/security/cost)</span></Row>
                  </>
                )}
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      {related.length > 0 && (
        <Card>
          <CardHeader title="Recurrence: other discussions about the same pain point" description="Grouped by the model; open each to judge for yourself." />
          <ul className="divide-y divide-border">
            {related.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <Link href={`/discussions/${r.id}`} className="min-w-0 hover:underline">
                  {r.title}
                </Link>
                <span className="flex items-center gap-3 text-xs text-text-3">
                  <SourceBadge source={r.source_id} /> {fmtDate(r.published_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
