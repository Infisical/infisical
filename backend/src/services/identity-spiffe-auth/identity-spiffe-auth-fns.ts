import https from "https";
import { JSONWebKeySet, JWK } from "jose";
import picomatch from "picomatch";
import RE2 from "re2";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

const KID_MISS_REFRESH_COOLDOWN_SECONDS = 30;

const SPIFFE_ID_REGEX = new RE2("^spiffe:\\/\\/([^/]+)(\\/.*)?");

export const isValidSpiffeId = (value: string): boolean => {
  return SPIFFE_ID_REGEX.test(value);
};

export const extractTrustDomainFromSpiffeId = (spiffeId: string): string => {
  const match = SPIFFE_ID_REGEX.exec(spiffeId);
  if (!match) {
    throw new Error(`Invalid SPIFFE ID: ${spiffeId}`);
  }
  return match[1];
};

export const doesSpiffeIdMatchPattern = (spiffeId: string, patterns: string): boolean => {
  const patternList = patterns
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return patternList.some((pattern) => picomatch.isMatch(spiffeId, pattern));
};

const BUNDLE_FETCH_TIMEOUT_MS = 10_000;
const MAX_BUNDLE_SIZE_BYTES = 1_048_576; // 1 MB

export const fetchRemoteBundleJwks = async (url: string, caCert?: string): Promise<string> => {
  const response = await request.get<string>(url, {
    responseType: "text",
    timeout: BUNDLE_FETCH_TIMEOUT_MS,
    maxContentLength: MAX_BUNDLE_SIZE_BYTES,
    maxBodyLength: MAX_BUNDLE_SIZE_BYTES,
    httpsAgent: caCert ? new https.Agent({ ca: caCert, rejectUnauthorized: true }) : undefined
  });

  return response.data;
};

// SPIFFE bundles (`spire-server bundle show -format spiffe`, bundle endpoints) are JWKS with
// `use` set to the SVID type. JWT-SVID verification only needs the "jwt-svid" keys, and jose
// drops any key whose `use` is not "sig", so those keys are re-marked. Keys with `use: "sig"`
// or no `use` are also kept so hand-converted RFC 7517 JWKS bundles keep working.
export const parseSpiffeBundleJwtAuthorities = (bundleJson: string): JSONWebKeySet => {
  let bundle: unknown;
  try {
    bundle = JSON.parse(bundleJson);
  } catch {
    throw new BadRequestError({ message: "The SPIFFE trust bundle is not valid JSON" });
  }

  const keys = (bundle as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(keys)) {
    throw new BadRequestError({ message: 'The SPIFFE trust bundle must be a JSON object with a "keys" array' });
  }

  const jwtAuthorities = keys
    .filter(
      (key): key is JWK =>
        typeof key === "object" &&
        key !== null &&
        !Array.isArray(key) &&
        ((key as JWK).use === undefined || (key as JWK).use === "jwt-svid" || (key as JWK).use === "sig")
    )
    .map((key) => ({ ...key, use: "sig" }));

  if (!jwtAuthorities.length) {
    throw new BadRequestError({
      message:
        'The SPIFFE trust bundle contains no JWT-SVID signing keys. Expected at least one key with "use": "jwt-svid", as output by `spire-server bundle show -format spiffe`.'
    });
  }

  return { keys: jwtAuthorities };
};

export const claimKidMissRefresh = async (
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">,
  configId: string
): Promise<boolean> => {
  try {
    return Boolean(
      await keyStore.setItemWithExpiryNX(
        KeyStorePrefixes.SpiffeKidMissRefresh(configId),
        KID_MISS_REFRESH_COOLDOWN_SECONDS,
        "1"
      )
    );
  } catch (error) {
    logger.warn(error, `SPIFFE auth: skipping kid-miss bundle refresh, keystore unavailable [configId=${configId}]`);
    return false;
  }
};
