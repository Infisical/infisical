// The WHATWG application/x-www-form-urlencoded serializer, which escapes everything except letters, digits and
// `*-._` (space becomes `+`). RFC 6749 section 2.3.1 uses it for client credentials.
export const formUrlEncode = (value: string) => new URLSearchParams([["", value]]).toString().slice(1);

// The client_secret_basic credential: both halves form-encoded, joined with `:` and base64 encoded. Some servers
// (Google) compare the halves without decoding them, so they accept only credentials that encode to themselves.
export const clientSecretBasicCredentials = (clientId: string, clientSecret: string) =>
  Buffer.from(`${formUrlEncode(clientId)}:${formUrlEncode(clientSecret)}`).toString("base64");
