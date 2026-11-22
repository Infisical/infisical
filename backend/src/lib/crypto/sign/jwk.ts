import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";

import { AsymmetricKeyAlgorithm } from "./types";

// ML-DSA has no registered JWK representation yet, so verifiers could not read it
const JWK_KEY_ALGORITHMS = new Set<string>([
  AsymmetricKeyAlgorithm.RSA_4096,
  AsymmetricKeyAlgorithm.ECC_NIST_P256,
  AsymmetricKeyAlgorithm.ECC_NIST_P384,
  AsymmetricKeyAlgorithm.ECC_NIST_P521,
  AsymmetricKeyAlgorithm.ED25519
]);

// RSA keys sign with RS* or PS*, so their JWK leaves alg out and the verifier takes it from the token header
const JWS_ALGORITHM_BY_KEY_ALGORITHM: Partial<Record<AsymmetricKeyAlgorithm, string>> = {
  [AsymmetricKeyAlgorithm.ECC_NIST_P256]: "ES256",
  [AsymmetricKeyAlgorithm.ECC_NIST_P384]: "ES384",
  [AsymmetricKeyAlgorithm.ECC_NIST_P521]: "ES512",
  [AsymmetricKeyAlgorithm.ED25519]: "EdDSA"
};

export type TPublicJwkParams =
  | { kty: "RSA"; n: string; e: string }
  | { kty: "EC"; crv: string; x: string; y: string }
  | { kty: "OKP"; crv: string; x: string };

export type TPublicJwk = {
  kty: string;
  use: "sig";
  kid: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
};

export const isJwkKeyAlgorithm = (keyAlgorithm: string) => JWK_KEY_ALGORITHMS.has(keyAlgorithm);

// Only the public parameters, so each caller adds the kid and alg its verifiers expect
export const getPublicJwkParams = (publicKey: Buffer): TPublicJwkParams => {
  const jwk = crypto.nativeCrypto
    .createPublicKey({ key: publicKey, format: "der", type: "spki" })
    .export({ format: "jwk" });

  switch (jwk.kty) {
    case "RSA":
      return { kty: "RSA", n: jwk.n as string, e: jwk.e as string };
    case "EC":
      return { kty: "EC", crv: jwk.crv as string, x: jwk.x as string, y: jwk.y as string };
    case "OKP":
      return { kty: "OKP", crv: jwk.crv as string, x: jwk.x as string };
    default:
      throw new BadRequestError({
        message: `Keys of type '${jwk.kty ?? "unknown"}' can't be represented as a JWK. Use an RSA, ECC or ED25519 key.`
      });
  }
};

export const publicKeyToJwk = ({
  publicKey,
  keyAlgorithm,
  kid
}: {
  publicKey: Buffer;
  keyAlgorithm: AsymmetricKeyAlgorithm;
  kid: string;
}): TPublicJwk => {
  const { kty, ...params } = getPublicJwkParams(publicKey);
  const alg = JWS_ALGORITHM_BY_KEY_ALGORITHM[keyAlgorithm];

  return { kty, use: "sig", kid, ...(alg ? { alg } : {}), ...params };
};
