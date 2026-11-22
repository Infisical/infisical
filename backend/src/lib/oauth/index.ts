// The WHATWG application/x-www-form-urlencoded serializer, which escapes everything except letters, digits and
// `*-._` (space becomes `+`). RFC 6749 section 2.3.1 uses it for client credentials.
export const formUrlEncode = (value: string) => new URLSearchParams([["", value]]).toString().slice(1);

// The client_secret_basic credential: both halves form-encoded, joined with `:` and base64 encoded. Some servers
// (Google) compare the halves without decoding them, so they accept only credentials that encode to themselves.
export const clientSecretBasicCredentials = (clientId: string, clientSecret: string) =>
  Buffer.from(`${formUrlEncode(clientId)}:${formUrlEncode(clientSecret)}`).toString("base64");

// The OpenID Provider configuration URL for a discovery URL (OpenID Connect Discovery 1.0, section 4): an issuer
// URL gets /.well-known/openid-configuration appended, and a URL that already names a well-known document is
// used as given.
export const buildOidcDiscoveryDocumentUrl = (discoveryUrl: string) => {
  const url = new URL(discoveryUrl);
  if (url.pathname.includes("/.well-known/")) return url.toString();

  const pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${pathname}/.well-known/openid-configuration`;
  return url.toString();
};
