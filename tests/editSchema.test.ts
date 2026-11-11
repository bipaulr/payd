import { describe, expect, it } from "vitest";
import { EditSchema } from "@/lib/bills/edit";

describe("EditSchema", () => {
  it("accepts partial edits", () => {
    expect(EditSchema.safeParse({ total: "12.50", dueDate: "2026-12-01" }).success).toBe(true);
  });
  it("rejects float-looking or malformed values and unknown keys", () => {
    expect(EditSchema.safeParse({ total: "12.505" }).success).toBe(false);
    expect(EditSchema.safeParse({ dueDate: "12/01/2026" }).success).toBe(false);
    expect(EditSchema.safeParse({ status: "paid" }).success).toBe(false);
  });
});
