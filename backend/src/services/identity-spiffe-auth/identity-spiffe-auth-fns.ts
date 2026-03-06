import https from "https";

import picomatch from "picomatch";

const SPIFFE_ID_REGEX = /^spiffe:\/\/([^/]+)(\/.*)?$/;

export const isValidSpiffeId = (value: string): boolean => {
  return SPIFFE_ID_REGEX.test(value);
};

export const extractTrustDomainFromSpiffeId = (spiffeId: string): string => {
  const match = spiffeId.match(SPIFFE_ID_REGEX);
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

export const findSigningKeyInJwks = (jwksJson: string, kid: string) => {
  const jwks = JSON.parse(jwksJson) as { keys: Array<{ kid?: string; use?: string; kty: string; [key: string]: unknown }> };

  if (!jwks.keys || !Array.isArray(jwks.keys)) {
    throw new Error("Invalid JWKS: missing keys array");
  }

  const matchingKey = jwks.keys.find((key) => key.kid === kid);

  if (!matchingKey) {
    throw new Error(`No key found in JWKS matching kid: ${kid}`);
  }

  return matchingKey;
};

const BUNDLE_FETCH_TIMEOUT_MS = 10_000;
const MAX_BUNDLE_SIZE_BYTES = 1_048_576; // 1 MB

export const fetchRemoteBundleJwks = (url: string, caCert?: string): Promise<string> => {
  const parsedUrl = new URL(url);

  return new Promise<string>((resolve, reject) => {
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        agent: caCert ? new https.Agent({ ca: caCert, rejectUnauthorized: true }) : undefined,
        timeout: BUNDLE_FETCH_TIMEOUT_MS
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          req.destroy(new Error(`Failed to fetch SPIFFE trust bundle: HTTP ${res.statusCode}`));
          return;
        }

        const contentLengthHeader = res.headers["content-length"];
        if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_BUNDLE_SIZE_BYTES) {
          req.destroy(new Error("SPIFFE trust bundle response exceeds maximum allowed size"));
          return;
        }

        res.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_BUNDLE_SIZE_BYTES) {
            req.destroy(new Error("SPIFFE trust bundle response exceeds maximum allowed size"));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolve(Buffer.concat(chunks).toString());
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("SPIFFE trust bundle fetch timed out")));
    req.on("error", reject);
    req.end();
  });
};
