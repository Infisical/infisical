import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { CertKeyAlgorithm, CertSubjectAlternativeNameType } from "@app/services/certificate/certificate-types";

import { AWS_ACM_CERTIFICATE_VALIDITY_DAYS } from "./aws-acm-public-ca-certificate-authority-enums";

export const ACM_ALLOWED_KEY_ALGORITHMS = new Set<string>([
  CertKeyAlgorithm.RSA_2048,
  CertKeyAlgorithm.ECDSA_P256,
  CertKeyAlgorithm.ECDSA_P384
]);

export const ACM_FIXED_VALIDITY_MS = AWS_ACM_CERTIFICATE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Pre-flight validator for ACM issuance inputs. Called both by the async fns
 * (defense in depth) and synchronously by the certificate order API before
 * enqueuing, so the user gets a 400 on submit rather than a FAILED request
 * row a moment later.
 */
export const validateAcmIssuanceInputs = ({
  csr,
  keyAlgorithm,
  altNames,
  ttl,
  notBefore,
  notAfter,
  basicConstraints,
  organization,
  organizationalUnit,
  country,
  state,
  locality,
  isRenewal
}: {
  csr?: string;
  keyAlgorithm?: string;
  altNames?: Array<{ type: CertSubjectAlternativeNameType; value: string }>;
  ttl?: string;
  notBefore?: Date | string;
  notAfter?: Date | string;
  basicConstraints?: { isCA?: boolean; pathLength?: number };
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  isRenewal?: boolean;
}) => {
  if (csr) {
    throw new BadRequestError({
      message: "AWS Certificate Manager does not support CSR-based issuance"
    });
  }
  if (keyAlgorithm && !ACM_ALLOWED_KEY_ALGORITHMS.has(keyAlgorithm)) {
    throw new BadRequestError({
      message: `AWS ACM only supports RSA_2048, EC_prime256v1, and EC_secp384r1 key algorithms. Received: ${keyAlgorithm}`
    });
  }
  if (organization || organizationalUnit || country || state || locality) {
    throw new BadRequestError({
      message: "AWS Certificate Manager does not support subject fields (O, OU, C, ST, L)"
    });
  }
  if (altNames) {
    for (const san of altNames) {
      if (san.type !== CertSubjectAlternativeNameType.DNS_NAME) {
        throw new BadRequestError({
          message: `AWS Certificate Manager only supports DNS SANs. Unsupported SAN type: ${san.type}`
        });
      }
    }
  }
  // On renewal, ACM handles validity itself — we don't pass a TTL to AWS, and the
  // TTL derived from the original cert may round down (e.g., 197.999d → "197d"),
  // so skip the exact-match check.
  if (!isRenewal) {
    if (!ttl) {
      throw new BadRequestError({
        message: `AWS Certificate Manager issues certificates with a fixed validity of ${AWS_ACM_CERTIFICATE_VALIDITY_DAYS} days.`
      });
    }
    let ttlMs: number;
    try {
      ttlMs = ms(ttl);
    } catch {
      throw new BadRequestError({
        message: `Invalid TTL format: ${ttl}`
      });
    }
    if (ttlMs !== ACM_FIXED_VALIDITY_MS) {
      throw new BadRequestError({
        message: `AWS Certificate Manager issues certificates with a fixed validity of ${AWS_ACM_CERTIFICATE_VALIDITY_DAYS} days.`
      });
    }
    if (notBefore || notAfter) {
      throw new BadRequestError({
        message: `AWS Certificate Manager does not support notBefore or notAfter — validity is fixed at ${AWS_ACM_CERTIFICATE_VALIDITY_DAYS} days from issuance.`
      });
    }
  }
  if (basicConstraints?.isCA) {
    throw new BadRequestError({
      message: "AWS Certificate Manager does not issue CA certificates."
    });
  }
};

export const mapCertKeyAlgorithmToAcm = (keyAlgorithm: CertKeyAlgorithm) => {
  switch (keyAlgorithm) {
    case CertKeyAlgorithm.RSA_2048:
      return "RSA_2048";
    case CertKeyAlgorithm.ECDSA_P256:
      return "EC_prime256v1";
    case CertKeyAlgorithm.ECDSA_P384:
      return "EC_secp384r1";
    default:
      throw new BadRequestError({
        message: `AWS ACM only supports RSA_2048, EC_prime256v1, and EC_secp384r1 key algorithms. Received: ${keyAlgorithm as string}`
      });
  }
};

// ACM's ExportCertificate passphrase must be 4-128 chars and cannot contain #, $, or %.
const ACM_PASSPHRASE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const generateAcmPassphrase = (): string => {
  const len = 32;
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += ACM_PASSPHRASE_ALPHABET[bytes[i] % ACM_PASSPHRASE_ALPHABET.length];
  }
  return out;
};

// ACM validity is fixed — clamp renewBeforeDays so auto-renewal fires before expiry.
export const calculateAcmRenewBeforeDays = (
  profile: { apiConfig?: { autoRenew?: boolean; renewBeforeDays?: number } } | undefined
): number | undefined => {
  if (!profile?.apiConfig?.autoRenew || !profile.apiConfig.renewBeforeDays) {
    return undefined;
  }
  const profileRenewBeforeDays = profile.apiConfig.renewBeforeDays;
  if (profileRenewBeforeDays >= AWS_ACM_CERTIFICATE_VALIDITY_DAYS) {
    return Math.max(1, AWS_ACM_CERTIFICATE_VALIDITY_DAYS - 1);
  }
  return profileRenewBeforeDays;
};

// Strip hyphens from the certificate UUID to produce a 32-char token that
// satisfies AWS's IdempotencyToken constraints (max 32 chars, alphanumeric).
export const buildIdempotencyToken = (certificateId: string) => certificateId.replace(/-/g, "").slice(0, 32);

export class AcmValidationPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcmValidationPendingError";
  }
}

// Use the same class shape for a terminal validation failure — signal via name.
export const acmValidationFailedError = (message: string) => {
  const err = new Error(message);
  err.name = "AcmValidationFailedError";
  return err;
};
