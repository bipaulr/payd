import type { z } from "zod";

export interface BillFile {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}

/**
 * The one seam between payD and a vision model. Swap providers by
 * implementing this; extractBill() owns prompting, validation and retries.
 */
export interface VisionProvider {
  /** Model id recorded with every extraction, e.g. "gemini-3.8-flash". */
  readonly model: string;
  /**
   * Returns the model's raw JSON text (possibly invalid). `file` is attached
   * when given; text-only calls (risk engine) omit it.
   */
  generateJson(input: { file?: BillFile; instructions: string; schema: z.ZodType }): Promise<string>;
}
