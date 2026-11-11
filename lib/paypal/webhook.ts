import { PAYPAL_API_BASE, readJson } from "./config";
import { getAccessToken } from "./token";

// Doc: https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post

export const PAYPAL_SIGNATURE_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

export interface WebhookVerification {
  /** true only when PayPal answered verification_status SUCCESS. */
  verified: boolean;
  /** PayPal's verification_status, or our own reason when we never asked PayPal. */
  verificationStatus: string;
  /** Parsed event, or null if the body was not a JSON object. */
  event: Record<string, unknown> | null;
  headers: Record<string, string | null>;
}

/** Verify a PayPal webhook delivery with the postback API. Never throws. */
export async function verifyWebhook(request: Request): Promise<WebhookVerification> {
  const rawBody = await request.text();
  const headers = Object.fromEntries(PAYPAL_SIGNATURE_HEADERS.map((h) => [h, request.headers.get(h)]));
  let event: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) event = parsed as Record<string, unknown>;
  } catch {
    // handled below
  }
  const result = (verificationStatus: string, verified = false): WebhookVerification => ({
    verified,
    verificationStatus,
    event,
    headers,
  });

  if (!event) return result("INVALID_JSON");
  if (PAYPAL_SIGNATURE_HEADERS.some((h) => !headers[h])) return result("MISSING_HEADERS");
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return result("NO_WEBHOOK_ID");

  // Splice the raw body in verbatim so re-serialising cannot change what PayPal signed.
  const prefix = JSON.stringify({
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: webhookId,
  }).slice(0, -1);
  const payload = `${prefix},"webhook_event":${rawBody}}`;

  try {
    const token = await getAccessToken();
    const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: payload,
    });
    const body = (await readJson(res)) as { verification_status?: unknown } | null;
    if (!res.ok) return result(`VERIFY_HTTP_${res.status}`);
    const status = typeof body?.verification_status === "string" ? body.verification_status : "UNKNOWN";
    return result(status, status === "SUCCESS");
  } catch {
    return result("VERIFY_ERROR");
  }
}
