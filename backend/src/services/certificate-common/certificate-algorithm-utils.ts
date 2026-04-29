import { z } from "zod";

import { CertKeyAlgorithm, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";

const KEY_ALGORITHM_ALIAS_MAP: Record<string, CertKeyAlgorithm> = {
  "RSA-2048": CertKeyAlgorithm.RSA_2048,
  "RSA-3072": CertKeyAlgorithm.RSA_3072,
  "RSA-4096": CertKeyAlgorithm.RSA_4096,

  ECDSA_P256: CertKeyAlgorithm.ECDSA_P256,
  "ECDSA-P256": CertKeyAlgorithm.ECDSA_P256,
  EC_P256: CertKeyAlgorithm.ECDSA_P256,

  ECDSA_P384: CertKeyAlgorithm.ECDSA_P384,
  "ECDSA-P384": CertKeyAlgorithm.ECDSA_P384,
  EC_P384: CertKeyAlgorithm.ECDSA_P384,

  ECDSA_P521: CertKeyAlgorithm.ECDSA_P521,
  "ECDSA-P521": CertKeyAlgorithm.ECDSA_P521,
  EC_P521: CertKeyAlgorithm.ECDSA_P521
};

const SIGNATURE_ALGORITHM_ALIAS_MAP: Record<string, CertSignatureAlgorithm> = {
  RSA_SHA256: CertSignatureAlgorithm.RSA_SHA256,
  RSA_SHA384: CertSignatureAlgorithm.RSA_SHA384,
  RSA_SHA512: CertSignatureAlgorithm.RSA_SHA512,
  ECDSA_SHA256: CertSignatureAlgorithm.ECDSA_SHA256,
  ECDSA_SHA384: CertSignatureAlgorithm.ECDSA_SHA384,
  ECDSA_SHA512: CertSignatureAlgorithm.ECDSA_SHA512,

  "SHA256-RSA": CertSignatureAlgorithm.RSA_SHA256,
  "SHA384-RSA": CertSignatureAlgorithm.RSA_SHA384,
  "SHA512-RSA": CertSignatureAlgorithm.RSA_SHA512,
  "SHA256-ECDSA": CertSignatureAlgorithm.ECDSA_SHA256,
  "SHA384-ECDSA": CertSignatureAlgorithm.ECDSA_SHA384,
  "SHA512-ECDSA": CertSignatureAlgorithm.ECDSA_SHA512
};

export const normalizeKeyAlgorithm = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  return Object.hasOwn(KEY_ALGORITHM_ALIAS_MAP, value) ? KEY_ALGORITHM_ALIAS_MAP[value] : value;
};

export const normalizeSignatureAlgorithm = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  return Object.hasOwn(SIGNATURE_ALGORITHM_ALIAS_MAP, value) ? SIGNATURE_ALGORITHM_ALIAS_MAP[value] : value;
};

export const certKeyAlgorithmSchema = z.preprocess(normalizeKeyAlgorithm, z.nativeEnum(CertKeyAlgorithm));

export const certSignatureAlgorithmSchema = z.preprocess(
  normalizeSignatureAlgorithm,
  z.nativeEnum(CertSignatureAlgorithm)
);
