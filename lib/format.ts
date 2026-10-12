// Small display helpers. Dates are always shown in India time (IST),
// because that is where Sumit works.

const TZ = "Asia/Kolkata";

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }) : "–";

export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: TZ,
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase()) + " IST"
    : "–";

export function fmtDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "–";
  const seconds = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export const SOURCE_LABEL: Record<string, string> = {
  hackernews: "Hacker News",
  github: "GitHub Issues",
  devto: "DEV.to",
  stackoverflow: "Stack Overflow",
};

/** The next Vercel Cron run: Friday 02:30 UTC (= 08:00 IST), strictly after `from`. */
export function nextScheduledRun(from = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 2, 30));
  const daysToFriday = (5 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + daysToFriday);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** "3 h ago", "2 days ago": how old a timestamp is (for freshness). */
export function fmtAge(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Days since a timestamp (Infinity when missing). */
export function daysSince(iso: string | null | undefined, now = Date.now()): number {
  return iso ? (now - new Date(iso).getTime()) / 86_400_000 : Infinity;
}

/**
 * Display-only clean-up of markdown syntax inside a stored excerpt
 * (headings, bold, code ticks, link syntax). The words stay
 * exactly as collected; only formatting characters are removed.
 */
export function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/(^|\s)#{1,6}\s+/g, "$1") // ### heading
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold** (not __x__: that can be a real identifier)
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // `code`
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Split a label into lines of at most `max` characters at word boundaries (never truncates). */
export function wrapWords(text: string, max = 22): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
