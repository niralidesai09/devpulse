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
      }) + " IST"
    : "–";

export function fmtDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "–";
  const seconds = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export const SOURCE_LABEL: Record<string, string> = {
  hackernews: "Hacker News",
  github: "GitHub",
  devto: "DEV.to",
  stackoverflow: "Stack Overflow",
};
