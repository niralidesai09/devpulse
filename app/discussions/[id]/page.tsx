// One discussion: the author's words on the left, Gemini's interpretation on the right.

import { ArrowRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { evidenceLabel } from "@/components/Evidence";
import { ExcludeButton } from "@/components/ExcludeButton";
import { Badge, Callout, ErrorPanel, PageHeader, Panel, Section, SourceLink, SourceTag } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { getDiscussion, getRelatedDiscussions } from "@/lib/db/discussions";
import { safeLoad } from "@/lib/db/safe";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { readableExcerpt } from "@/lib/text";

export const metadata: Metadata = { title: "Discussion" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0 text-[14px] leading-[22px] text-ink">{children}</dd>
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
  const s = d.signals as { kind?: string; isOpen?: boolean; hasAcceptedAnswer?: boolean; repo?: string; parentTitle?: string };
  const isComment = d.title.startsWith("Comment on:");
  const signalText =
    [
      s.isOpen !== undefined && (s.isOpen ? "GitHub issue is open" : "GitHub issue is closed"),
      s.hasAcceptedAnswer !== undefined && (s.hasAcceptedAnswer ? "Has an accepted answer" : "No accepted answer"),
      s.repo && `Repository ${s.repo}`,
    ]
      .filter(Boolean)
      .join(" · ") || "None";

  return (
    <div className="space-y-12">
      <PageHeader
        back={{ href: "/discussions", label: "Discussions" }}
        title={isComment ? evidenceLabel(d) : d.title}
        meta={
          <>
            <SourceTag source={d.source_id} />
            <span>{fmtDateTime(d.published_at)}</span>
            {d.author && <span>by {d.author}</span>}
            <SourceLink href={d.url} className="font-medium text-accent-ink">
              Open the original
            </SourceLink>
          </>
        }
        actions={admin ? <ExcludeButton id={d.id} excluded={d.is_excluded} /> : undefined}
      />

      {d.is_excluded && (
        <Callout tone="up" title="Excluded from analysis">
          {d.exclusion_reason ?? "No reason given"} · {fmtDateTime(d.excluded_at)}. It no longer counts in metrics or as evidence in new briefs.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="author" className="min-w-0">
          <h2 id="author" className="mb-3 text-[13px] font-medium tracking-[0.04em] text-ink-3 uppercase">
            What the author wrote
          </h2>
          {isComment && <p className="mb-2 text-[13px] text-ink-3">A comment in the thread “{s.parentTitle ?? d.title.replace(/^Comment on:\s*/, "")}”</p>}
          {d.excerpt ? (
            <blockquote className="border-l-2 border-line-strong pl-4 text-[15px] leading-[26px] text-ink">{readableExcerpt(d.excerpt)}</blockquote>
          ) : (
            <p className="text-[14px] text-ink-3">The original has no body text — only the title.</p>
          )}
          <p className="mt-3 text-[12px] text-ink-3">The author’s words, with HTML and Markdown formatting removed for reading; long posts are trimmed around the matched keyword.</p>
          <dl className="mt-6 divide-y divide-line border-y border-line">
            <Row label="Engagement">
              <span className="tabular">
                {d.score ?? 0} {d.source_id === "github" ? "reactions" : "points"} · {d.comment_count ?? 0} {s.kind === "question" ? "answers" : "comments"}
              </span>
            </Row>
            <Row label="Source signals">{signalText}</Row>
            <Row label="Matched keywords">
              <span className="flex flex-wrap gap-1">
                {d.matched_keywords.map((k) => (
                  <Badge key={k}>{k}</Badge>
                ))}
              </span>
            </Row>
            <Row label="Collected">
              first {fmtDateTime(d.first_retrieved_at)} · last checked {fmtDateTime(d.last_retrieved_at)}
            </Row>
          </dl>
        </section>

        <section aria-labelledby="ai" className="min-w-0">
          <Panel className="p-6">
            <h2 id="ai" className="flex items-center gap-1.5 text-[13px] font-medium tracking-[0.04em] text-accent-ink uppercase">
              <Sparkles className="size-3.5" aria-hidden /> Gemini’s interpretation
            </h2>
            {!a ? (
              <p className="mt-3 text-[14px] text-ink-2">
                {d.analysis_status === "failed"
                  ? `Analysis failed after ${d.analysis_attempts} attempt(s): ${d.analysis_error ?? "unknown error"}. It is retried on the next collection.`
                  : "Not analysed yet — the next collection will analyse it."}
              </p>
            ) : (
              <>
                <p className="mt-3 text-[15px] leading-6 text-ink">
                  {a.is_relevant ? (a.problem_summary ?? "Relevant, no summary.") : "Not relevant to code review, CI/CD or developer workflow."}
                </p>
                <dl className="mt-4 divide-y divide-line border-y border-line">
                  <Row label="Why relevant?">{a.relevance_reason}</Row>
                  {a.is_relevant && (
                    <>
                      <Row label="Pain point">
                        {a.pain_point ? (
                          <Link href={`/pain-points/${a.pain_point.id}`} className="text-accent-ink hover:underline">
                            {a.pain_point.title}
                          </Link>
                        ) : (
                          "Not grouped yet"
                        )}
                      </Row>
                      <Row label="Topic">{a.topic?.name ?? "—"}</Row>
                      <Row label="Key quote">
                        {a.evidence_quote && a.quote_verified ? (
                          <>
                            “{a.evidence_quote}” <Badge tone="ok">Checked word-for-word</Badge>
                          </>
                        ) : (
                          <span className="text-ink-3">None — the model gave no quote, or it could not be found verbatim and was discarded.</span>
                        )}
                      </Row>
                      <Row label="Still unresolved?">
                        {a.is_unresolved === null ? "—" : a.is_unresolved ? "Yes" : "No"} <span className="text-ink-2">— {a.unresolved_evidence ?? "no evidence given"}</span>
                      </Row>
                      <Row label="Workaround">{a.workaround ?? "None described"}</Row>
                      <Row label="Tools named">
                        {a.tools_mentioned.length ? a.tools_mentioned.join(", ") : "None"}
                        {a.tool_dissatisfaction ? " · the author is unhappy with a tool" : ""}
                      </Row>
                      <Row label="Severity">{a.severity ? `${a.severity} of 5` : "—"} <span className="text-[12px] text-ink-3">(1 annoyance … 5 outages, security or real cost)</span></Row>
                    </>
                  )}
                </dl>
                <p className="mt-3 text-[12px] text-ink-3">
                  {a.model} · {a.prompt_version} · {fmtDateTime(a.analyzed_at)}. Model judgements, not facts — exclude this discussion if it is wrong.
                </p>
              </>
            )}
          </Panel>
        </section>
      </div>

      {related.length > 0 && (
        <Section title="Other discussions about the same problem" description="Grouped together by Gemini. Open each one to judge for yourself.">
          <ul className="divide-y divide-line border-y border-line">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/discussions/${r.id}`} className="group flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0 text-[14px] text-ink group-hover:text-accent-ink">{r.title}</span>
                  <span className="flex items-center gap-3 text-[12px] text-ink-3">
                    <SourceTag source={r.source_id} /> {fmtDate(r.published_at)}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
