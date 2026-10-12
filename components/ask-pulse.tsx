"use client";
// "Ask the Pulse": a small chat. Each question is answered by the AI model using
// ONLY posts Groundswell has stored (found with Postgres full-text search),
// with numbered links to the real threads. "Not enough data" otherwise.

import { useState } from "react";
import { markdownToHtml } from "@/lib/markdown";

type Citation = { ref: string; title: string; url: string; source: string };
type Turn = { question: string; answer?: string; citations?: Citation[]; enoughData?: boolean; postsFound?: number; error?: string };

const EXAMPLES = [
  "Why do teams turn off AI code review bots?",
  "What do developers say about CodeRabbit?",
  "Which flaky test problems are still unresolved?",
];

export function AskPulse() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setQuestion("");
    setTurns((t) => [{ question: text }, ...t]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      setTurns((t) => [{ question: text, ...(res.ok ? data : { error: data.error ?? "Something went wrong." }) }, ...t.slice(1)]);
    } catch {
      setTurns((t) => [{ question: text, error: "Network error. Please try again." }, ...t.slice(1)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="ask" className="mt-10 scroll-mt-4 rounded-xl border border-line bg-surface p-4 sm:p-6" aria-labelledby="ask-heading">
      <h2 id="ask-heading" className="text-sm font-semibold">
        Ask the Pulse
      </h2>
      <p className="mt-0.5 text-xs text-ink-3">Answers come only from posts Groundswell has collected, with links to every source.</p>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder="e.g. What CI problems do developers complain about most?"
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length < 3}
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-white disabled:opacity-50 dark:text-[#0d1726]"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>

      {turns.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-ink-3 hover:text-ink"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <ol className="mt-4 space-y-4" aria-live="polite">
        {turns.map((t, i) => (
          <li key={turns.length - i} className="border-t border-line pt-4 first:border-0 first:pt-0">
            <p className="text-sm font-medium">{t.question}</p>
            {t.error ? (
              <p className="mt-1 text-sm text-bad">{t.error}</p>
            ) : t.answer === undefined ? (
              <p className="mt-1 text-sm text-ink-3">Searching collected posts…</p>
            ) : (
              <>
                <div className={`brief mt-1 ${t.enoughData ? "" : "text-ink-2"}`} dangerouslySetInnerHTML={{ __html: markdownToHtml(t.answer) }} />
                {t.citations && t.citations.length > 0 && (
                  <ol className="mt-2 space-y-0.5 text-xs">
                    {t.citations.map((c) => (
                      <li key={c.ref} className="truncate">
                        <span className="tabular text-ink-3">{c.ref} </span>
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {c.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-1 text-[11px] text-ink-3">Based on {t.postsFound ?? 0} matching stored posts</p>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
