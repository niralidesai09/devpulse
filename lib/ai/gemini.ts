// Gemini Flash wrapper — the ONLY place in the app that talks to an AI model.
// Uses Google's official @google/genai SDK; the model id comes from
// GEMINI_MODEL and must be a Flash model (checked below).
//
// generateJson() makes model output safe to use:
//   1. Structured output: a JSON Schema (generated from our Zod schema) is
//      sent as responseJsonSchema, so Gemini must answer in that shape.
//   2. Validation: the reply is parsed and validated with the same Zod
//      schema. Invalid → ONE repair attempt that shows the model its error.
//      Still invalid → throw (callers keep raw data and retry later).
//   3. Transient errors (429 / 5xx / timeouts): bounded exponential backoff,
//      honouring Google's retryDelay hint, max 4 retries.
//   4. Every call has a timeout and an input-size cap.

import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

const MAX_TRANSIENT_RETRIES = 4;
const CALL_TIMEOUT_MS = 120_000;
const MAX_PROMPT_CHARS = 200_000; // ~50k tokens — well inside Flash's context, bounds cost

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing environment variable GEMINI_API_KEY");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/** The configured Gemini model. Refuses anything that is not a Flash model (exam requirement). */
export function getModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model) throw new Error("Missing environment variable GEMINI_MODEL");
  if (!/^gemini-[\w.-]*flash[\w.-]*$/i.test(model)) {
    throw new Error(`GEMINI_MODEL must be a Gemini Flash model (got "${model}")`);
  }
  return model;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 (quota / rate limit), 5xx (overloaded) and timeouts are worth retrying; 400/401/403/404 are not. */
export function isTransient(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
  if (err instanceof Error) return /timeout|aborted|ECONNRESET|fetch failed|network/i.test(err.message);
  return false;
}

/** Google often returns "retryDelay": "17s"; otherwise 2s, 4s, 8s, 16s. Capped at 45s. */
export function backoffMs(err: unknown, attempt: number): number {
  const match = err instanceof Error ? err.message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) : null;
  if (match) return Math.min(Number(match[1]) * 1000 + 250, 45_000);
  return Math.min(2000 * 2 ** attempt, 45_000);
}

/** A quota-exhausted 429 (daily limit) will not recover by waiting a few seconds. */
export function isQuotaExhausted(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429 && /per.?day|PerDay|quota exceeded/i.test(err.message);
}

async function callGemini(opts: {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  thinkingLevel: ThinkingLevel;
  temperature: number;
}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await getClient().models.generateContent({
        model: getModel(),
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.jsonSchema,
          thinkingConfig: { thinkingLevel: opts.thinkingLevel },
          temperature: opts.temperature,
          abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        },
      });
      return response.text ?? "";
    } catch (err) {
      if (!isTransient(err) || isQuotaExhausted(err) || attempt >= MAX_TRANSIENT_RETRIES) throw err;
      await sleep(backoffMs(err, attempt));
    }
  }
}

/** Zod schema → JSON Schema accepted by Gemini (drops the "$schema" header). */
export function toGeminiSchema(schema: z.ZodType): unknown {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  void $schema;
  return jsonSchema;
}

export class GeminiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiOutputError";
  }
}

/**
 * Ask Gemini for JSON matching `schema`; returns the validated, typed result.
 * Throws GeminiOutputError if the reply is still invalid after one repair attempt.
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
}): Promise<T> {
  if (opts.prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`Prompt too large (${opts.prompt.length} chars, limit ${MAX_PROMPT_CHARS})`);
  }
  const jsonSchema = toGeminiSchema(opts.schema);
  let prompt = opts.prompt;
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await callGemini({
      system: opts.system,
      prompt,
      jsonSchema,
      thinkingLevel: opts.thinkingLevel ?? ThinkingLevel.LOW,
      temperature: opts.temperature ?? 0.2,
    });
    const parsed = parseAndValidate(text, opts.schema);
    if (parsed.ok) return parsed.value;
    lastError = parsed.error;
    // Repair attempt: same task, plus the validation error.
    prompt =
      `${opts.prompt}\n\nIMPORTANT: your previous reply was rejected by the validator with this error:\n` +
      `${lastError}\nReturn ONLY JSON that matches the schema exactly.`;
  }
  throw new GeminiOutputError(`Gemini returned invalid JSON twice: ${lastError}`);
}

/** Parse JSON text and validate it — exported for unit tests. */
export function parseAndValidate<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${(err as Error).message.slice(0, 200)}` };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  };
}

export { ThinkingLevel };
