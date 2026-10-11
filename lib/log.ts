// Structured JSON logging (one line per event) — readable in Vercel logs and
// searchable by runId / reportId. Never pass secrets or full payloads here.

type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(base: Fields = {}) {
  return {
    info: (event: string, fields: Fields = {}) => emit("info", event, { ...base, ...fields }),
    warn: (event: string, fields: Fields = {}) => emit("warn", event, { ...base, ...fields }),
    error: (event: string, fields: Fields = {}) => emit("error", event, { ...base, ...fields }),
    child: (more: Fields) => logger({ ...base, ...more }),
  };
}

export type Logger = ReturnType<typeof logger>;

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
