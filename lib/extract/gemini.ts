import { createGoogle } from "@ai-sdk/google";
import { APICallError, generateText, NoObjectGeneratedError, Output } from "ai";
import type { VisionProvider } from "./provider";
import { isTimeout, with429Backoff } from "./backoff";

const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_FALLBACK = "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.7-flash";

/** VISION_MODEL first, then VISION_MODEL_FALLBACK (comma separated), without repeats. */
export function modelChain(primary?: string, fallback?: string): string[] {
  const list = [primary ?? process.env.VISION_MODEL ?? DEFAULT_MODEL, ...(fallback ?? process.env.VISION_MODEL_FALLBACK ?? DEFAULT_FALLBACK).split(",")];
  return [...new Set(list.map((m) => m.trim()).filter(Boolean))];
}

/** Overloaded, rate limited or hung: worth trying the next model. */
function isTransient(err: unknown): boolean {
  if (APICallError.isInstance(err)) return [429, 500, 503, 404].includes(err.statusCode ?? 0); // 404: the model id was retired
  return isTimeout(err);
}

/** Models that just failed are skipped for a few minutes so each upload does not wait on them again. */
const coolingDown = new Map<string, number>();
const COOL_DOWN_MS = 3 * 60_000;

/**
 * Google Gemini via the AI SDK. Key and model come from GEMINI_API_KEY and
 * VISION_MODEL. `timeoutMs` bounds each model call so a hung request fails
 * (and callers fall back) instead of stalling an upload. When a model is
 * overloaded (503), rate limited (429) or times out, the next model in
 * VISION_MODEL_FALLBACK is tried; `model` reports the one that answered last.
 */
export function geminiProvider(opts: { apiKey?: string; model?: string; fallback?: string; timeoutMs?: number } = {}): VisionProvider {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const models = modelChain(opts.model, opts.fallback);
  const timeoutMs = opts.timeoutMs ?? 30_000;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const google = createGoogle({ apiKey });
  let used = models[0];
  return {
    get model() {
      return used;
    },
    async generateJson({ file, instructions, schema }) {
      let lastError: unknown;
      const now = Date.now();
      const healthy = models.filter((m) => (coolingDown.get(m) ?? 0) <= now);
      const order = healthy.length ? healthy : models;
      for (const [i, model] of order.entries()) {
        const last = i === order.length - 1;
        try {
          const result = await with429Backoff(
            () =>
              generateText({
                model: google(model),
                maxRetries: 0, // 429 and 503 are handled by with429Backoff; validation retry by extractBill
                timeout: timeoutMs,
                output: Output.object({ schema }),
                messages: [
                  {
                    role: "user",
                    content: file
                      ? [
                          { type: "text", text: instructions },
                          { type: "file", data: file.bytes, mediaType: file.mimeType },
                        ]
                      : [{ type: "text", text: instructions }],
                  },
                ],
              }),
            // Move on quickly while another model is left; be patient with the last one.
            last ? { retries: 2 } : { retries: 0 },
          );
          used = model;
          return JSON.stringify(result.output);
        } catch (err) {
          if (NoObjectGeneratedError.isInstance(err)) {
            used = model;
            return err.text ?? "";
          }
          lastError = err;
          if (isTransient(err)) coolingDown.set(model, Date.now() + COOL_DOWN_MS);
          if (last || !isTransient(err)) throw err;
          console.warn(`vision model ${model} unavailable, trying ${order[i + 1]}`);
        }
      }
      throw lastError;
    },
  };
}
