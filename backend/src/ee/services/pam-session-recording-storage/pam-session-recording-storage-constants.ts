// Versioning suffix on AAD lets us swap binding scheme later without migrating ciphertext
export const PAM_RECORDING_AAD_VERSION = "v1";

// 5-minute presigned URL expiry for both PUT and GET URLs
export const PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS = 300;

// Hard ceiling on a single chunk's ciphertext size -- 256 MB
// RDP can produce large keyframes; this protects backend, S3, and browser
export const PAM_RECORDING_MAX_CHUNK_BYTES = 256 * 1024 * 1024;
