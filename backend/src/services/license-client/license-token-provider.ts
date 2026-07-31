import { logger } from "@app/lib/logger";

export type TLicenseTokenProvider = {
  // Exchanges the license key for a JWT (cached until near expiry) and returns it as a bearer.
  getToken: () => Promise<string>;
  // Drops the cached token so the next getToken re-exchanges (used to recover from a mid-flight 401).
  invalidate: () => void;
};

const LICENSE_LOGIN_PATH = "/api/auth/v1/license-login";

// Refresh this many seconds before the JWT's exp so an in-flight request never carries an expired token.
const EXPIRY_MARGIN_SECONDS = 60;

// Fallback cache lifetime when the token carries no readable exp — short enough to re-exchange often,
// long enough to avoid a login per request.
const FALLBACK_TTL_SECONDS = 5 * 60;

// Read exp (unix seconds) from a JWT without verifying it — the license server verifies the signature;
// we only need the expiry to schedule a refresh. Returns null when exp is missing/unreadable.
const readJwtExp = (token: string): number | null => {
  const segments = token.split(".");
  if (segments.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
};

export const createSelfHostedTokenProvider = (
  licenseKey: string,
  opts: { serverUrl: string }
): TLicenseTokenProvider => {
  let cachedToken: string | null = null;
  let expiresAtSeconds = 0;
  // Single-flight: concurrent callers on an expired token share one exchange instead of stampeding.
  let pending: Promise<string> | null = null;

  const exchange = async (): Promise<string> => {
    const url = new URL(LICENSE_LOGIN_PATH, opts.serverUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-API-KEY": licenseKey, "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual"
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`license-client: token exchange failed [status=${res.status}] ${detail}`.trim());
    }
    const body = (await res.json()) as { token?: string };
    if (!body.token) {
      throw new Error("license-client: token exchange returned no token");
    }
    return body.token;
  };

  const getToken = async (): Promise<string> => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (cachedToken && nowSeconds < expiresAtSeconds - EXPIRY_MARGIN_SECONDS) {
      return cachedToken;
    }
    if (pending) {
      return pending;
    }
    pending = (async () => {
      try {
        const token = await exchange();
        cachedToken = token;
        expiresAtSeconds = readJwtExp(token) ?? nowSeconds + FALLBACK_TTL_SECONDS;
        return token;
      } catch (error) {
        logger.error(error, "license-client: failed to obtain a license token");
        throw error;
      } finally {
        pending = null;
      }
    })();
    return pending;
  };

  const invalidate = () => {
    cachedToken = null;
    expiresAtSeconds = 0;
  };

  return { getToken, invalidate };
};
