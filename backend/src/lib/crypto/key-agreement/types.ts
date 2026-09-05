import { AsymmetricKeyAlgorithm } from "../sign";

export enum KeyAgreementAlgorithm {
  ECDH = "ECDH"
}

export const EccNistKeyAlgorithm = {
  ECC_NIST_P256: AsymmetricKeyAlgorithm.ECC_NIST_P256,
  ECC_NIST_P384: AsymmetricKeyAlgorithm.ECC_NIST_P384,
  ECC_NIST_P521: AsymmetricKeyAlgorithm.ECC_NIST_P521
} as const;

export type EccNistKeyAlgorithm = (typeof EccNistKeyAlgorithm)[keyof typeof EccNistKeyAlgorithm];