export enum AwsAcmValidationMethod {
  DNS = "DNS"
}

/**
 * ACM public certificates have a fixed validity period (as of 2025).
 * See: https://docs.aws.amazon.com/acm/latest/userguide/managed-renewal.html
 */
export const AWS_ACM_CERTIFICATE_VALIDITY_DAYS = 198;
