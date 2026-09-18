import crypto from "node:crypto";

import { BadRequestError } from "@app/lib/errors";

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

  const contentKey = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash },
    Buffer.from(wrappedKey, "base64url")
  );

  const decipher = crypto.createDecipheriv("aes-256-gcm", contentKey, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(protectedHeader, "ascii"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString();
};

/**
 * Test and sandbox accounts return the secret in plaintext, live accounts return a JWE. Both shapes
 * are real, and the one we develop against is not the one that matters.
 */
export const readStripeSecret = (secretKey: TStripeSecretKeyField | undefined, privateKeyPem: string): string => {
  if (secretKey?.token) return secretKey.token;

  const ciphertext = secretKey?.encrypted_secret?.ciphertext;

  if (!ciphertext) {
    throw new BadRequestError({
      message: "Stripe returned an API key without a secret. The key may need to be created again."
    });
  }

  return decryptStripeJwe(ciphertext, privateKeyPem);
};
