import { crypto } from "@app/lib/crypto/cryptography";

const TURN_TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
export const getTurnCredentials = (id: string, authSecret: string, ttl = TURN_TOKEN_TTL) => {
  const timestamp = Math.floor((Date.now() + ttl) / 1000);
  const username = `${timestamp}:${id}`;

  const hmac = crypto.nativeCrypto.createHmac("sha1", authSecret);
  hmac.update(username);
  const password = hmac.digest("base64");

  return {
    username,
    password
  };
};
