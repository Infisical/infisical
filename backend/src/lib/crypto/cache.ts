import crypto from "node:crypto";

export const generateCacheKeyFromData = (data: unknown) =>
  crypto
    .createHash("md5")
    .update(JSON.stringify(data))
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
