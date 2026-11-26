export const PAM_RECORDING_AAD_VERSION = "v1";

export const PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS = 300;

// 256 MB hard ceiling per chunk -- RDP can produce large keyframes
export const PAM_RECORDING_MAX_CHUNK_BYTES = 256 * 1024 * 1024;

// Server-side readers hold several copies of a chunk while decrypting and parsing it.
export const PAM_RECORDING_MAX_SERVER_READ_BYTES = 16 * 1024 * 1024;

export const PAM_RECORDING_SERVER_READ_TIMEOUT_MS = 20_000;
