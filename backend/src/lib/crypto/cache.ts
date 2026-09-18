import { crypto } from "@app/lib/crypto/cryptography";

export const generateCacheKeyFromBuffer = (data: Buffer) =>
  crypto.nativeCrypto
    .createHash("sha256")
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

export const generateCacheKeyFromData = (data: unknown) =>
  generateCacheKeyFromBuffer(Buffer.from(JSON.stringify(data)));
