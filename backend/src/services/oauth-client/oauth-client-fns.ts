import crypto from "node:crypto";

export const parseBasicAuthHeader = (
  authorizationHeader?: string
): { clientId: string; clientSecret: string } | null => {
  if (!authorizationHeader) return null;

  const [scheme, value] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !value) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return null;

  try {
    return {
      clientId: decodeURIComponent(decoded.slice(0, separatorIndex)),
      clientSecret: decodeURIComponent(decoded.slice(separatorIndex + 1))
    };
  } catch {
    return null;
  }
};

export const computePkceChallenge = (codeVerifier: string) => {
  const sha256 = crypto.createHash("sha256").update(codeVerifier).digest();
  return Buffer.from(sha256).toString("base64url");
};

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

// A redirect URI may use https:// for any host. Plaintext http:// is only permitted for loopback
// addresses (local development), per RFC 8252 / the OAuth 2.0 security BCP. Allowing http:// to an
// arbitrary host would expose authorization codes and tokens to network interception.
export const isAllowedRedirectUri = (uri: string) => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") return true;

  if (parsed.protocol === "http:") {
    const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip brackets from IPv6 literals
    return LOOPBACK_HOSTNAMES.has(hostname);
  }

  return false;
};

export const isRegisteredRedirectUri = (registeredUris: string[], redirectUri: string) =>
  registeredUris.some((uri) => {
    if (uri === redirectUri) return true;
    try {
      return new URL(uri).toString() === new URL(redirectUri).toString();
    } catch {
      return false;
    }
  });
