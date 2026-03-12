import https from "https";
import picomatch from "picomatch";
import RE2 from "re2";

import { request } from "@app/lib/config/request";

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
