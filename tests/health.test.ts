import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) } }));

describe("GET /api/health", () => {
  it("reports a healthy database", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "healthy" });
  });
});
