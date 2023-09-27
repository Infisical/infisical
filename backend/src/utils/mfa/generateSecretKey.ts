import { randomBytes, randomFillSync } from "crypto";
import { promisify } from "util";

import { AUTH_APP_PARAMS } from "../../variables";
import { customBase32Encode } from "./base32EncodeAndDecode";

// Example two-factor secret key >>> RD564C3XCKZMZOMUYFPLJIMXXJXVAJCU

export const generateSecretKey = async (): Promise<string> => {
  let authAppSecretBuffer: Buffer | null = null;
  let authAppSecretKey: string | null = null;
  
  try {
    const randomBytesAsync = promisify(randomBytes);
    authAppSecretBuffer = await randomBytesAsync(AUTH_APP_PARAMS.secret_key_bytes);
    authAppSecretKey = customBase32Encode(authAppSecretBuffer);

    return authAppSecretKey;
  } catch (err) {
    throw new Error("Failed to generate secret key");
  } finally {
    if (authAppSecretBuffer) {
      try {
        randomFillSync(authAppSecretBuffer);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Error cleaning up secret key buffer:", err);
      }
      authAppSecretBuffer.fill(0);
      authAppSecretBuffer = null;
    }
    if (authAppSecretKey) {
      authAppSecretKey = null;
    }
  }
};