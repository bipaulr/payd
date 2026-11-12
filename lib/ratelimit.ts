/** In-memory sliding-window rate limiter, per key (usually an IP). One instance, so memory is enough. */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return { ok: true, retryAfterSec: 0 };
}

/** Client IP behind a proxy (Render sets x-forwarded-for); "local" when there is none. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** A 429 response if this caller is over the limit for `bucket`, else null. */
export function limited(req: Request, bucket: string, limit: number, windowMs = 60_000): Response | null {
  const r = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (r.ok) return null;
  return Response.json(
    { error: `Too many requests. Try again in ${r.retryAfterSec} seconds.` },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } },
  );
}
