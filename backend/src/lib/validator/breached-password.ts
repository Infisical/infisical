import { crypto } from "@app/lib/crypto/cryptography";

import { getConfig } from "../config/env";
import { request } from "../config/request";
import { logger } from "../logger";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const REQUEST_TIMEOUT_MS = 3000;

// Have I Been Pwned range search. Only the first five hex characters of the SHA-1 (the range API's
// key) leave the process; the suffix is compared here.
export const isPasswordBreached = async (password: string): Promise<boolean> => {
  const appCfg = getConfig();
  if (appCfg.DISABLE_BREACHED_PASSWORD_CHECK) return false;

  const hash = crypto.nativeCrypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const { data } = await request.get<string>(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: "text",
      // One attempt: the shared client's backoff would keep a user waiting well past the timeout.
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
    // Fail open: an unreachable third party must not block a password change.
    logger.warn(error, "isPasswordBreached: Have I Been Pwned lookup failed, skipping breach check");
    return false;
  }
};
