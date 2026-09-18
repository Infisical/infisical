import crypto from "node:crypto";

import { TOauthClients } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { OauthGrantType } from "./oauth-client-types";

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

// RFC 7636 §4.1: the code_verifier is 43-128 characters from the unreserved set
// [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~". Enforcing this guarantees the verifier
// carries enough entropy that the challenge cannot be brute-forced against the token endpoint.
export const PKCE_CODE_VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;

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

// OAuth token sessions are tagged with this userAgent so they are distinguishable from first-party
// browser sessions and from other clients. Deleting a client revokes its sessions by this exact value,
// so the format must stay in sync between session creation and revocation.
export const getOauthClientSessionUserAgent = (clientId: string) => `Infisical OAuth - ${clientId}`;

type TOauthClientAuthority = Pick<
  TOauthClients,
  "clientSecretHash" | "grantTypes" | "tokenExchangeAudience" | "tokenExchangeIdpSatisfiesMfa"
>;

// Whether the client has lost the authority it was granted mid-request: deleted, secret rotated, or the
// grant withdrawn. Comparing the stored hashes is enough, since a rotation writes a fresh bcrypt hash.
//
// Token exchange also compares the two fields carrying its federation trust: the audience is all that
// stands between the caller and any token the issuer signs, and the IdP-MFA flag is what lets an exchange
// skip an MFA requirement. The exchange reads both off a replica, so without this they'd survive the
// change for the length of the replication lag.
export const hasClientAuthorityChanged = (
  authenticated: TOauthClientAuthority,
  current: TOauthClientAuthority | undefined,
  grantType: OauthGrantType
) => {
  if (!current) return true;
  if (current.clientSecretHash !== authenticated.clientSecretHash) return true;
  if (!current.grantTypes.includes(grantType)) return true;

  if (grantType === OauthGrantType.TokenExchange) {
    return (
      current.tokenExchangeAudience !== authenticated.tokenExchangeAudience ||
      Boolean(current.tokenExchangeIdpSatisfiesMfa) !== Boolean(authenticated.tokenExchangeIdpSatisfiesMfa)
    );
  }

  return false;
};

type TTokenExchangeTrust = {
  isEnabled: boolean;
  audience?: string | null;
  idpSatisfiesMfa?: boolean | null;
};

// Whether an update takes back federation trust the client already holds, in which case the tokens issued
// under the old configuration have to go with it. Guards the same fields as hasClientAuthorityChanged,
// for the same reason. An admin narrowing either is responding to a problem, so it has to reach the tokens
// already out there instead of waiting for them to expire.
//
// Any audience change counts, in either direction, since tokens issued under the old one were accepted on
// a basis that no longer holds. The MFA declaration only counts when switched off: turning it on widens
// what is exchangeable without invalidating anything already issued.
export const hasWithdrawnTokenExchangeTrust = (previous: TTokenExchangeTrust, next: TTokenExchangeTrust) => {
  if (!previous.isEnabled) return false;
  if (!next.isEnabled) return true;
  if ((next.audience ?? null) !== (previous.audience ?? null)) return true;

  return Boolean(previous.idpSatisfiesMfa) && !next.idpSatisfiesMfa;
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

type TOauthClientGrantConfig = {
  grantTypes: OauthGrantType[];
  resolved: {
    redirectUris: string[];
    tokenExchangeAudience?: string | null;
  };
  supplied: {
    redirectUris?: string[];
    requirePkce?: boolean;
    tokenExchangeAudience?: string | null;
    tokenExchangeIdpSatisfiesMfa?: boolean;
  };
};

export const assertValidOauthClientGrantConfig = ({ grantTypes, resolved, supplied }: TOauthClientGrantConfig) => {
  if (!grantTypes.length) {
    throw new BadRequestError({ message: "At least one grant type must be enabled for an application." });
  }

  const isRedirectBased = grantTypes.includes(OauthGrantType.AuthorizationCode);
  const isTokenExchange = grantTypes.includes(OauthGrantType.TokenExchange);

  if (isRedirectBased && isTokenExchange) {
    throw new BadRequestError({
      message: `The '${OauthGrantType.TokenExchange}' grant cannot be combined with the '${OauthGrantType.AuthorizationCode}' grant. An application uses one or the other. Register a second application if you need both flows.`
    });
  }

  if (grantTypes.includes(OauthGrantType.RefreshToken) && !grantTypes.includes(OauthGrantType.AuthorizationCode)) {
    throw new BadRequestError({
      message: `The '${OauthGrantType.RefreshToken}' grant requires the '${OauthGrantType.AuthorizationCode}' grant, because refresh tokens are only issued by the authorization code flow.`
    });
  }

  if (isRedirectBased && !resolved.redirectUris.length) {
    throw new BadRequestError({
      message: `At least one redirect URI is required for the '${OauthGrantType.AuthorizationCode}' grant.`
    });
  }

  if (!isRedirectBased && supplied.redirectUris?.length) {
    throw new BadRequestError({
      message: `Redirect URIs only apply to the '${OauthGrantType.AuthorizationCode}' grant. Enable that grant or remove the redirect URIs.`
    });
  }

  if (!isRedirectBased && supplied.requirePkce) {
    throw new BadRequestError({
      message: `PKCE only applies to the '${OauthGrantType.AuthorizationCode}' grant. Enable that grant or turn off the PKCE requirement.`
    });
  }

  if (isTokenExchange && !resolved.tokenExchangeAudience?.trim()) {
    throw new BadRequestError({
      message: `A token exchange audience is required for the '${OauthGrantType.TokenExchange}' grant. Set it to the audience your identity provider puts in tokens it issues for this application.`
    });
  }

  if (!isTokenExchange && supplied.tokenExchangeAudience?.trim()) {
    throw new BadRequestError({
      message: `The token exchange audience only applies to the '${OauthGrantType.TokenExchange}' grant. Enable that grant or remove the audience.`
    });
  }

  if (!isTokenExchange && supplied.tokenExchangeIdpSatisfiesMfa) {
    throw new BadRequestError({
      message: `The identity provider MFA declaration only applies to the '${OauthGrantType.TokenExchange}' grant. Enable that grant or turn the declaration off.`
    });
  }
};
