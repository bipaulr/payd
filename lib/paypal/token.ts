import { PAYPAL_API_BASE, PayPalError, paypalCredentials, readJson } from "./config";

// Doc: https://developer.paypal.com/api/rest/authentication/
let cached: { token: string; expiresAt: number } | null = null;

/** Client-credentials OAuth token, cached in memory until expires_in minus 60 s. */
export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const { clientId, clientSecret } = paypalCredentials();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await readJson(res)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !body?.access_token) {
    throw new PayPalError(`PayPal OAuth failed (${res.status})`, res.status, body);
  }
  const ttlMs = Math.max(0, (body.expires_in ?? 0) - 60) * 1000;
  cached = { token: body.access_token, expiresAt: Date.now() + ttlMs };
  return body.access_token;
}

/** Test hook. */
export function clearTokenCache(): void {
  cached = null;
}
