export const PAM_RECORDING_AAD_VERSION = "v1";

export const PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS = 300;

// 256 MB hard ceiling per chunk -- RDP can produce large keyframes
export const PAM_RECORDING_MAX_CHUNK_BYTES = 256 * 1024 * 1024;
