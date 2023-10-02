import argon2 from "argon2";

export const ALGORITHM_AES_256_GCM = "aes-256-gcm";
export const NONCE_BYTES_SIZE = 12;
export const BLOCK_SIZE_BYTES_16 = 16;

export const ENCODING_SCHEME_UTF8 = "utf8";
export const ENCODING_SCHEME_HEX = "hex";
export const ENCODING_SCHEME_BASE64 = "base64";

export const SALT_BLIND_INDEX_PARAMS = Object.freeze({
  SALT_LENGTH: 16,
  ENCODING: ENCODING_SCHEME_BASE64
})

export const ARGON_BLIND_INDEX_PARAMS = Object.freeze({
  TYPE: argon2.argon2id,
  SALT_LENGTH: 16, // default 16 bytes
  MEMORY_COST: 65536, // default pool of 64 MiB per thread.
  HASH_LENGTH: 32,
  PARALLELISM: 1,
  RAW: true,
})