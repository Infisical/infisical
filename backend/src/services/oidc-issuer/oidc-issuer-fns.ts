import { calculateJwkThumbprint, JWK } from "jose";

import { crypto } from "@app/lib/crypto/cryptography";

export const OIDC_ISSUER_KEY_NAME_PREFIX = "oidc-issuer-";
export const OIDC_ISSUER_SIGNING_ALG = "RS256";

const KEY_SIGNING_PERIOD_MS = 24 * 60 * 60 * 1000;
const MAX_KEYS = 3;

type TIssuerKey = { id: string; createdAt: Date };

// Customers copy this into their provider, so its shape can never change. The prefix keeps it from matching a
// credential set up for a future use of the issuer.
export const getAppConnectionOidcSubject = (connectionId: string) => `app-connection:${connectionId}`;

export const getOidcIssuerUrl = (siteUrl: string, orgId: string) =>
  `${siteUrl}/api/v1/oidc-issuer/organizations/${orgId}`;

// Keys are oldest first: previous, current, next. The next key is published a full signing period before it
// takes over, so a provider that cached the JWKS already has it.
export const getSigningKey = <T extends TIssuerKey>(keys: T[]): T | undefined => keys[keys.length - 2];

export const getKeyRotationPlan = (
  keys: TIssuerKey[],
  now = new Date()
): { keysToCreate: number; keyIdsToDelete: string[] } => {
  if (keys.length < 2) return { keysToCreate: 2 - keys.length, keyIdsToDelete: [] };

  if (now.getTime() - keys[keys.length - 1].createdAt.getTime() < KEY_SIGNING_PERIOD_MS) {
    return { keysToCreate: 0, keyIdsToDelete: [] };
  }

  return { keysToCreate: 1, keyIdsToDelete: keys.slice(0, keys.length + 1 - MAX_KEYS).map(({ id }) => id) };
};

export const publicKeyToJwk = async (spki: Buffer) => {
  const { kty, n, e } = crypto.nativeCrypto
    .createPublicKey({ key: spki, format: "der", type: "spki" })
    .export({ format: "jwk" }) as Required<Pick<JWK, "kty" | "n" | "e">>;

  return { kty, n, e, kid: await calculateJwkThumbprint({ kty, n, e }), alg: OIDC_ISSUER_SIGNING_ALG, use: "sig" };
};

const encodeSegment = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

export const signJwt = async ({
  kid,
  claims,
  sign
}: {
  kid: string;
  claims: Record<string, unknown>;
  sign: (data: Buffer) => Promise<Buffer>;
}) => {
  const signingInput = `${encodeSegment({ alg: OIDC_ISSUER_SIGNING_ALG, typ: "JWT", kid })}.${encodeSegment(claims)}`;
  const signature = await sign(Buffer.from(signingInput));

  return `${signingInput}.${signature.toString("base64url")}`;
};
