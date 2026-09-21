import crypto from "node:crypto";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

export type TStripeSecretKeyField = {
  token?: string | null;
  encrypted_secret?: { ciphertext?: string | null } | null;
};

// Stripe names OAEP with SHA-1 `RSA-OAEP`, which is the JOSE spelling. Both are accepted by the
// FIPS provider for key transport, so neither needs a fallback.
const SUPPORTED_KEY_ALGORITHMS: Record<string, "sha1" | "sha256"> = {
  "RSA-OAEP": "sha1",
  "RSA-OAEP-256": "sha256"
};

const SUPPORTED_CONTENT_ALGORITHM = "A256GCM";

// A256GCM fixes the authentication tag at 16 bytes. Node accepts any tag length OpenSSL supports
// unless it is told otherwise, so a truncated tag would authenticate against fewer bits than the
// algorithm promises.
const GCM_AUTH_TAG_LENGTH = 16;

export const generateStripeEncryptionKeyPair = async () =>
  new Promise<{ publicKey: string; privateKey: string }>((resolve, reject) => {
    crypto.generateKeyPair(
      "rsa",
      {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
      },
      (error, publicKey, privateKey) => (error ? reject(error) : resolve({ publicKey, privateKey }))
    );
  });

export const decryptStripeJwe = (jwe: string, privateKeyPem: string): string => {
  const segments = jwe.split(".");

  if (segments.length !== 5) {
    throw new BadRequestError({
      message: `Stripe returned a malformed encrypted secret: expected a compact JWE with 5 segments, got ${segments.length}.`
    });
  }

  const [protectedHeader, wrappedKey, iv, ciphertext, authTag] = segments;

  let header: { alg?: string; enc?: string };

  try {
    header = JSON.parse(Buffer.from(protectedHeader, "base64url").toString()) as typeof header;
  } catch {
    throw new BadRequestError({
      message: "Stripe returned an encrypted secret whose JWE header could not be parsed."
    });
  }

  const oaepHash = header.alg ? SUPPORTED_KEY_ALGORITHMS[header.alg] : undefined;

  if (!oaepHash) {
    throw new BadRequestError({
      message: `Stripe encrypted the secret with an unsupported key algorithm '${header.alg ?? "none"}'. Infisical supports RSA-OAEP and RSA-OAEP-256.`
    });
  }

  if (header.enc !== SUPPORTED_CONTENT_ALGORITHM) {
    throw new BadRequestError({
      message: `Stripe encrypted the secret with an unsupported content algorithm '${header.enc ?? "none"}'. Infisical supports ${SUPPORTED_CONTENT_ALGORITHM}.`
    });
  }

  const decodedAuthTag = Buffer.from(authTag, "base64url");

  if (decodedAuthTag.length !== GCM_AUTH_TAG_LENGTH) {
    throw new BadRequestError({
      message: `Stripe returned an encrypted secret whose authentication tag is ${decodedAuthTag.length} bytes. ${SUPPORTED_CONTENT_ALGORITHM} requires ${GCM_AUTH_TAG_LENGTH}.`
    });
  }

  try {
    const contentKey = crypto.privateDecrypt(
      { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash },
      Buffer.from(wrappedKey, "base64url")
    );

    const decipher = crypto.createDecipheriv("aes-256-gcm", contentKey, Buffer.from(iv, "base64url"), {
      authTagLength: GCM_AUTH_TAG_LENGTH
    });
    decipher.setAAD(Buffer.from(protectedHeader, "ascii"));
    decipher.setAuthTag(decodedAuthTag);

    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString();
  } catch (error) {
    // The underlying OpenSSL error (unpad failure, auth tag mismatch) carries no plaintext or key
    // material, but it is an implementation detail that must never reach a user, and its wording is
    // not a stable contract, so it is logged here rather than thrown.
    logger.error(error, "decryptStripeJwe: failed to decrypt a Stripe-returned secret");
    throw new BadRequestError({
      message: "Infisical could not decrypt the secret Stripe returned. Try creating the API key again."
    });
  }
};

/**
 * Stripe returns both shapes when a public key is supplied: a JWE, and the plaintext token beside
 * it. The JWE is preferred rather than the token, so the path live mode depends on is the one every
 * sandbox rotation exercises. Reading the token first would leave decryption unexercised outside
 * this module's own tests, which decrypt only what they themselves encrypted.
 */
export const readStripeSecret = (secretKey: TStripeSecretKeyField | undefined, privateKeyPem: string): string => {
  const ciphertext = secretKey?.encrypted_secret?.ciphertext;

  if (ciphertext) return decryptStripeJwe(ciphertext, privateKeyPem);

  if (secretKey?.token) return secretKey.token;

  throw new BadRequestError({
    message: "Stripe returned an API key without a secret. The key may need to be created again."
  });
};
