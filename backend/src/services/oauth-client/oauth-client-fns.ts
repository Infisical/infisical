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

export const isRegisteredRedirectUri = (registeredUris: string[], redirectUri: string) =>
  registeredUris.some((uri) => {
    if (uri === redirectUri) return true;
    try {
      return new URL(uri).toString() === new URL(redirectUri).toString();
    } catch {
      return false;
    }
  });
