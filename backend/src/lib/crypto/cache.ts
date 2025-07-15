import { crypto } from "@app/lib/crypto/cryptography";

export const generateCacheKeyFromData = (data: unknown) =>
  crypto.nativeCrypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
