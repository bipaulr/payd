import { APICallError } from "ai";

export interface BackoffOptions {
  retries?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(err: APICallError): number | undefined {
  const h = err.responseHeaders?.["retry-after"];
  if (!h) return undefined;
  const secs = Number(h);
  return Number.isFinite(secs) ? secs * 1000 : undefined;
}

/** Retries `fn` on HTTP 429 (free-tier rate limits) and 503 (model overloaded) with exponential backoff. */
export async function with429Backoff<T>(fn: () => Promise<T>, opts: BackoffOptions = {}): Promise<T> {
  const { retries = 4, baseMs = 2000, sleep = defaultSleep } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(APICallError.isInstance(err) && (err.statusCode === 429 || err.statusCode === 503)) || attempt >= retries) throw err;
      await sleep(retryAfterMs(err) ?? baseMs * 2 ** attempt);
    }
  }
}
