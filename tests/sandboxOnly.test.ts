import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { centsToValue, valueToCents } from "@/lib/money";
import { PAYPAL_API_BASE } from "@/lib/paypal/config";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "lib", "components", "scripts"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(name) ? [p] : [];
  });
}

describe("sandbox only", () => {
  it("the only PayPal API host is the sandbox", () => {
    expect(PAYPAL_API_BASE).toBe("https://api-m.sandbox.paypal.com");
  });

  it("no source file mentions a live PayPal host", () => {
    // Built from parts so this file does not match itself.
    const live = ["api-m" + ".paypal.com", "api" + ".paypal.com", "www" + ".paypal.com"];
    const offenders = DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => {
      const src = readFileSync(f, "utf8");
      return live.some((h) => src.includes(h));
    });
    expect(offenders).toEqual([]);
  });
});

describe("money", () => {
  it("converts between cents and PayPal values with no floats", () => {
    expect(centsToValue(20296)).toBe("202.96");
    expect(centsToValue(5)).toBe("0.05");
    expect(valueToCents("1,234.50")).toBe(123450);
    expect(valueToCents("0.1")).toBe(10);
    expect(valueToCents("19.99")).toBe(1999);
    expect(() => valueToCents("12.345")).toThrow();
    expect(() => centsToValue(1.5)).toThrow();
  });
});
