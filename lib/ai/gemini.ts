// Gemini Flash wrapper: the ONLY place in the app that talks to an AI model.
//
// Uses Google's official @google/genai SDK. The model name comes from the
// GEMINI_MODEL env var (e.g. "gemini-3.8-flash"), so it can be changed
// without touching code.
//
// generateJson() asks Gemini for JSON that follows a schema and makes it safe:
//   1. Structured output: we send a JSON Schema (built from our Zod schema),
//      so Gemini is forced to reply in that exact shape.
//   2. Validation: we still check the reply with Zod. If it is broken or
//      doesn't match, we ask ONE more time, then give up with an error.
//   3. Rate limits: if Google answers 429 (too many requests) or 5xx
//      (overloaded), we wait and try again: 2s, 4s, 8s, 16s.

import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

const MAX_RATE_LIMIT_RETRIES = 4;

let client: GoogleGenAI | null = null;

// Create the client once and reuse it.
function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing environment variable GEMINI_API_KEY");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/** The Gemini model name from the environment (must be a Flash model). */
export function getModel(): string {
  const model = process.env.GEMINI_MODEL;
  if (!model) throw new Error("Missing environment variable GEMINI_MODEL");
  return model;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Should we wait and retry this error? Yes for 429 (rate limit) and
 * 500/503 (Google overloaded). No for anything else (e.g. bad API key).
 */
function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.status >= 500);
}

/**
 * Google often says how long to wait, e.g. "retryDelay": "17s".
 * Use that if present, otherwise exponential backoff (2s, 4s, 8s, ...).
 */
function backoffMs(err: unknown, attempt: number): number {
  const match = err instanceof Error ? err.message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) : null;
  if (match) return Math.min(Number(match[1]) * 1000, 60_000);
  return 2000 * 2 ** attempt;
}

/** One call to Gemini, with wait-and-retry on rate limits. Returns raw text. */
async function callGemini(options: {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  thinkingLevel: ThinkingLevel;
}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await getClient().models.generateContent({
        model: getModel(),
        contents: options.prompt,
        config: {
          systemInstruction: options.system,
          responseMimeType: "application/json",
          responseJsonSchema: options.jsonSchema,
          // LOW thinking = faster + cheaper. Classification doesn't need deep reasoning.
          thinkingConfig: { thinkingLevel: options.thinkingLevel },
          temperature: 0.2, // low = consistent answers for the same post
        },
      });
      return response.text ?? "";
    } catch (err) {
      if (!isRetryable(err) || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
      await sleep(backoffMs(err, attempt));
    }
  }
}

/**
 * Ask Gemini for JSON matching `schema`. Returns the validated, typed result.
 * Throws if the reply is still invalid after one retry.
 */
export async function generateJson<T>(options: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  thinkingLevel?: ThinkingLevel;
}): Promise<T> {
  // Turn the Zod schema into a JSON Schema for Gemini. Zod stays the single
  // source of truth: the same schema shapes the request AND checks the reply.
  const { $schema, ...jsonSchema } = z.toJSONSchema(options.schema, { target: "draft-2020-12" });
  void $schema; // Gemini doesn't need the "$schema" header field

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await callGemini({
      system: options.system,
      prompt: options.prompt,
      jsonSchema,
      thinkingLevel: options.thinkingLevel ?? ThinkingLevel.LOW,
    });

    try {
      return options.schema.parse(JSON.parse(text));
    } catch (err) {
      // Broken JSON or wrong shape -> try exactly once more.
      lastError = err instanceof Error ? err.message.slice(0, 300) : String(err);
    }
  }
  throw new Error(`Gemini returned invalid JSON twice: ${lastError}`);
}

export { ThinkingLevel };
