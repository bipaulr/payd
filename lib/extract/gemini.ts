import { createGoogle } from "@ai-sdk/google";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { VisionProvider } from "./provider";
import { with429Backoff } from "./backoff";

/**
 * Google Gemini via the AI SDK. Key and model come from GEMINI_API_KEY and
 * VISION_MODEL. `timeoutMs` bounds each model call so a hung request fails
 * (and callers fall back) instead of stalling an upload.
 */
export function geminiProvider(opts: { apiKey?: string; model?: string; timeoutMs?: number } = {}): VisionProvider {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.VISION_MODEL ?? "gemini-3.8-flash";
  const timeoutMs = opts.timeoutMs ?? 90_000;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const google = createGoogle({ apiKey });
  return {
    model,
    async generateJson({ file, instructions, schema }) {
      try {
        const result = await with429Backoff(() =>
          generateText({
            model: google(model),
            maxRetries: 0, // 429 is handled by with429Backoff; validation retry by extractBill
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
        );
        return JSON.stringify(result.output);
      } catch (err) {
        if (NoObjectGeneratedError.isInstance(err)) return err.text ?? "";
        throw err;
      }
    },
  };
}
