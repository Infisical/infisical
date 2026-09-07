import crypto from "node:crypto";

import { InternalServerError } from "@app/lib/errors";

const COOKIE_SIGNING_KEY_CONTEXT = "infisical-cookie-signing-key-v1";

let cookieSigningKey: string | undefined;

/**
 * Derives the cookie signing key from the KMS root key, which is already generated and persisted
 * per instance at first boot. That keeps the key unique to the deployment without a second secret
 * at rest, and stable across restarts, replicas, and KEK rotations.
 */
export const deriveCookieSigningKey = (rootKey: Buffer) =>
  Buffer.from(crypto.hkdfSync("sha256", rootKey, Buffer.alloc(0), COOKIE_SIGNING_KEY_CONTEXT, 32)).toString("base64");

export const setCookieSigningKey = (key: string) => {
  cookieSigningKey = key;
};

export const getCookieSigningKey = () => {
  if (!cookieSigningKey) {
    throw new InternalServerError({
      message: "Cookie signing key was requested before the KMS root key was loaded"
    });
  }

  return cookieSigningKey;
};
