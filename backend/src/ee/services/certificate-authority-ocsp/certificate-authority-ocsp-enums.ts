export enum OcspResponseStatus {
  Successful = 0,
  MalformedRequest = 1,
  InternalError = 2,
  TryLater = 3,
  SigRequired = 5,
  Unauthorized = 6
}

export enum OcspCertStatus {
  Good = "good",
  Revoked = "revoked",
  Unknown = "unknown"
}

export const OCSP_BASIC_RESPONSE_OID = "1.3.6.1.5.5.7.48.1.1";
export const OCSP_NONCE_OID = "1.3.6.1.5.5.7.48.1.2";

export const OCSP_HASH_NAME_BY_OID: Record<string, string> = {
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512"
};

export const OCSP_REQUEST_CONTENT_TYPE = "application/ocsp-request";
export const OCSP_RESPONSE_CONTENT_TYPE = "application/ocsp-response";

export const OCSP_MAX_REQUEST_BYTES = 16 * 1024;
export const OCSP_MAX_CERT_IDS_PER_REQUEST = 32;
export const OCSP_MAX_SERIAL_HEX_LENGTH = 42;
export const OCSP_MAX_NONCE_BYTES = 32;
export const OCSP_RESPONSE_VALIDITY_SECONDS = 60 * 60;
export const OCSP_UNKNOWN_RESPONSE_VALIDITY_SECONDS = 60;
export const STORED_SERIAL_HEX_LENGTH = 40;
export const OCSP_MAX_CONCURRENT_SIGNATURES = 4;
export const OCSP_MAX_CONCURRENT_SIGNATURES_PER_CA = 2;
export const OCSP_SIGNING_QUEUE_TIMEOUT_MS = 5_000;
export const OCSP_SIGNING_MAX_QUEUE_DEPTH = 64;
export const OCSP_MAX_TRACKED_CA_LIMITERS = 256;
export const OCSP_SIGNING_MAX_TOTAL_IN_FLIGHT = 512;
export const OCSP_MAX_CACHED_CA_CERTIFICATES = 256;
export const OCSP_SATURATION_LOG_INTERVAL_MS = 10_000;
