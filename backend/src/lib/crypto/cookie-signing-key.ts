import crypto from "node:crypto";

const COOKIE_SIGNING_KEY_CONTEXT = "infisical-cookie-signing-key-v1";

/**
 * Derives the cookie signing key from the KMS root key, which is already generated and persisted
 * per instance at first boot. That keeps the key unique to the deployment without a second secret
 * at rest, and stable across restarts, replicas, and KEK rotations.
 */
export const deriveCookieSigningKey = (rootKey: Buffer) =>
  Buffer.from(crypto.hkdfSync("sha256", rootKey, Buffer.alloc(0), COOKIE_SIGNING_KEY_CONTEXT, 32)).toString("base64");
