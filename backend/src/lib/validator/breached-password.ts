import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const REQUEST_TIMEOUT_MS = 3000;

// The web app matches on this name.
export const BREACHED_PASSWORD_ERROR_NAME = "BREACHED_PASSWORD";

// Only the first five hex characters of the SHA-1 are sent; the suffix is compared here.
export const isPasswordBreached = async (password: string): Promise<boolean> => {
  const appCfg = getConfig();
  // Self-hosted instances may have no outbound access, so they opt in.
  const isEnabled = appCfg.BREACHED_PASSWORD_CHECK_ENABLED ?? (appCfg.isCloud || appCfg.INFISICAL_DEDICATED);
  if (!isEnabled) return false;

  const hash = crypto.nativeCrypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const { data } = await request.get<string>(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
      // axios's timeout stops counting once headers arrive; this bounds the whole request.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      responseType: "text",
      // No retries: the shared client's backoff would outlast the deadline.
      "axios-retry": { retries: 0 },
      headers: { "Add-Padding": "true" }
    });

    return data
      .toUpperCase()
      .split("\n")
      .some((line) => {
        const [candidate, count] = line.trim().split(":");
        // Padding records carry a zero count.
        return candidate === suffix && count !== "0";
      });
  } catch (error) {
    // Fail open: a failed lookup must not block a password change.
    logger.warn(error, "isPasswordBreached: Have I Been Pwned lookup failed, skipping breach check");
    return false;
  }
};

export const createBreachedPasswordError = () =>
  new BadRequestError({
    name: BREACHED_PASSWORD_ERROR_NAME,
    message: "This password has appeared in a known data breach. Choose a different password."
  });

export const assertPasswordNotBreached = async (password: string) => {
  if (await isPasswordBreached(password)) {
    throw createBreachedPasswordError();
  }
};
