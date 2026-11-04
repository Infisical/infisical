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

export const publicKeyToJwk = ({
  publicKey,
  keyAlgorithm,
  kid
}: {
  publicKey: Buffer;
  keyAlgorithm: AsymmetricKeyAlgorithm;
  kid: string;
}): TPublicJwk => {
  const jwk = crypto.nativeCrypto
    .createPublicKey({ key: publicKey, format: "der", type: "spki" })
    .export({ format: "jwk" });
  const alg = JWS_ALGORITHM_BY_KEY_ALGORITHM[keyAlgorithm];

  switch (jwk.kty) {
    case "RSA":
      return { kty: jwk.kty, use: "sig", kid, n: jwk.n, e: jwk.e };
    case "EC":
      return { kty: jwk.kty, use: "sig", kid, alg, crv: jwk.crv, x: jwk.x, y: jwk.y };
    case "OKP":
      return { kty: jwk.kty, use: "sig", kid, alg, crv: jwk.crv, x: jwk.x };
    default:
      throw new BadRequestError({
        message: `Keys using ${keyAlgorithm} can't be represented as a JWK. Use an RSA, ECC or ED25519 key.`
      });
  }
};
