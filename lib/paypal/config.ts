/** The only PayPal API host payD ever talks to. Sandbox only (CLAUDE.md). */
export const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

export function paypalCredentials(): { clientId: string; clientSecret: string } {
  if ((process.env.PAYPAL_ENV ?? "sandbox") !== "sandbox") {
    throw new Error("PAYPAL_ENV must be 'sandbox'; payD never calls live PayPal");
  }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  return { clientId, clientSecret };
}

/** Error from a PayPal REST call, keeping the HTTP status and parsed body. */
export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
