export enum AwsAcmValidationMethod {
  DNS = "DNS"
}

export enum AwsAcmKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  EC_prime256v1 = "EC_prime256v1",
  EC_secp384r1 = "EC_secp384r1"
}

/**
 * ACM public certificates have a fixed validity period (as of 2025).
 * See: https://docs.aws.amazon.com/acm/latest/userguide/managed-renewal.html
 */
export const AWS_ACM_CERTIFICATE_VALIDITY_DAYS = 198;
