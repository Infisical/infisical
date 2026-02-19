import { RevocationReason, SigningAlgorithm } from "@aws-sdk/client-acm-pca";

import { CrlReason } from "@app/services/certificate/certificate-types";

/**
 * Maps an AWS PCA CA key algorithm (as returned by DescribeCertificateAuthority)
 * to a default signing algorithm compatible with that key type.
 *
 * The SigningAlgorithm in IssueCertificateCommand must match the CA's key type,
 * NOT the leaf certificate's key type.
 */
export const CA_KEY_ALGORITHM_TO_SIGNING_ALGORITHM_MAP: Record<string, SigningAlgorithm> = {
  RSA_2048: SigningAlgorithm.SHA256WITHRSA,
  RSA_3072: SigningAlgorithm.SHA384WITHRSA,
  RSA_4096: SigningAlgorithm.SHA512WITHRSA,
  EC_prime256v1: SigningAlgorithm.SHA256WITHECDSA,
  EC_secp384r1: SigningAlgorithm.SHA384WITHECDSA,
  EC_secp521r1: SigningAlgorithm.SHA512WITHECDSA
};

/**
 * Maps Infisical CRL reasons to AWS PCA revocation reasons.
 */
export const CRL_REASON_TO_REVOCATION_REASON_MAP: Record<CrlReason, RevocationReason> = {
  [CrlReason.UNSPECIFIED]: RevocationReason.UNSPECIFIED,
  [CrlReason.KEY_COMPROMISE]: RevocationReason.KEY_COMPROMISE,
  [CrlReason.CA_COMPROMISE]: RevocationReason.CERTIFICATE_AUTHORITY_COMPROMISE,
  [CrlReason.AFFILIATION_CHANGED]: RevocationReason.AFFILIATION_CHANGED,
  [CrlReason.SUPERSEDED]: RevocationReason.SUPERSEDED,
  [CrlReason.CESSATION_OF_OPERATION]: RevocationReason.CESSATION_OF_OPERATION,
  [CrlReason.CERTIFICATE_HOLD]: RevocationReason.UNSPECIFIED, // AWS PCA doesn't have CERTIFICATE_HOLD
  [CrlReason.PRIVILEGE_WITHDRAWN]: RevocationReason.PRIVILEGE_WITHDRAWN,
  [CrlReason.A_A_COMPROMISE]: RevocationReason.A_A_COMPROMISE
};

/**
 * The CSR passthrough template ARN for AWS PCA.
 * This template passes through all CSR extensions to the issued certificate.
 */
export const CSR_PASSTHROUGH_TEMPLATE_ARN = "arn:aws:acm-pca:::template/BlankEndEntityCertificate_CSRPassthrough/V1";
