import { promisify } from "node:util";
import { zstdCompress, zstdDecompress } from "node:zlib";

// Async so a multi-MB payload compresses on the libuv pool instead of blocking the event loop.
const zstdCompressAsync = promisify(zstdCompress);
const zstdDecompressAsync = promisify(zstdDecompress);

// To compress data you also encrypt, compress first: ciphertext does not compress. That order is only
// safe when nobody who controls part of the input can observe the output length, or the size difference
// leaks the rest of it (CRIME/BREACH). Check that for your data before reusing this on it.
export const compressZstd = (payload: Buffer) => zstdCompressAsync(payload);

export const decompressZstd = (compressedPayload: Buffer) => zstdDecompressAsync(compressedPayload);
