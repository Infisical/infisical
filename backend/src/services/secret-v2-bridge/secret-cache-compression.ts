import { promisify } from "node:util";
import { zstdCompress, zstdDecompress } from "node:zlib";

// Async so a multi-MB payload compresses on the libuv pool instead of blocking the event loop.
const zstdCompressAsync = promisify(zstdCompress);
const zstdDecompressAsync = promisify(zstdDecompress);

// Compression runs before encryption: ciphertext does not compress, and the cached bytes never leave
// Redis, so the payload length is not observable by anyone who controls part of it.
export const compressSecretCachePayload = (payload: Buffer) => zstdCompressAsync(payload);

export const decompressSecretCachePayload = (compressedPayload: Buffer) => zstdDecompressAsync(compressedPayload);
