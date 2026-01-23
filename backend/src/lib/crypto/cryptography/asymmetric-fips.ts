import crypto, { KeyObject } from "node:crypto";

import { SecretEncryptionAlgo } from "@app/db/schemas/models";
import { CryptographyError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

export const asymmetricFipsValidated = () => {
  const generateKeyPair = async () => {
    const { publicKey, privateKey } = await new Promise<{ publicKey: KeyObject; privateKey: KeyObject }>((resolve) => {
      crypto.generateKeyPair("x25519", undefined, (err, pubKey, privKey) => {
        if (err) {
          logger.error(err, "FIPS generateKeyPair: Failed to generate key pair");
          throw new CryptographyError({
            message: "Failed to generate key pair"
          });
        }
        resolve({
          publicKey: pubKey,
          privateKey: privKey
        });
      });
    });

    return {
      publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
      privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")
    };
  };

  const encryptAsymmetric = (data: string, publicKey: string, privateKey: string) => {
    const pubKeyObj = crypto.createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      type: "spki",
      format: "der"
    });

    const privKeyObj = crypto.createPrivateKey({
      key: Buffer.from(privateKey, "base64"),
      type: "pkcs8",
      format: "der"
    });

    // Generate shared secret using x25519 curve
    const sharedSecret = crypto.diffieHellman({
      privateKey: privKeyObj,
      publicKey: pubKeyObj
    });

    const nonce = crypto.randomBytes(24);

    // Derive 32-byte key from shared secret
    const key = crypto.createHash("sha256").update(sharedSecret).digest();

    // Use first 12 bytes of nonce as IV for AES-GCM
    const iv = nonce.subarray(0, 12);

    // Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv(SecretEncryptionAlgo.AES_256_GCM, key, iv);

    const ciphertext = cipher.update(data, "utf8");
    cipher.final();

    const authTag = cipher.getAuthTag();

    // Combine ciphertext and auth tag
    const combined = Buffer.concat([ciphertext, authTag]);

    return {
      ciphertext: combined.toString("base64"),
      nonce: nonce.toString("base64")
    };
  };

  const decryptAsymmetric = ({
    ciphertext,
    nonce,
    publicKey,
    privateKey
  }: {
    ciphertext: string;
    nonce: string;
    publicKey: string;
    privateKey: string;
  }) => {
    // Convert base64 keys back to key objects
    const pubKeyObj = crypto.createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      type: "spki",
      format: "der"
    });

    const privKeyObj = crypto.createPrivateKey({
      key: Buffer.from(privateKey, "base64"),
      type: "pkcs8",
      format: "der"
    });

    // Generate same shared secret
    const sharedSecret = crypto.diffieHellman({
      privateKey: privKeyObj,
      publicKey: pubKeyObj
    });

    const nonceBuffer = Buffer.from(nonce, "base64");
    const combinedBuffer = Buffer.from(ciphertext, "base64");

    // Split ciphertext and auth tag (last 16 bytes for GCM)
    const actualCiphertext = combinedBuffer.subarray(0, -16);
    const authTag = combinedBuffer.subarray(-16);

    // Derive same 32-byte key
    const key = crypto.createHash("sha256").update(sharedSecret).digest();

    // Use first 12 bytes of nonce as IV
    const iv = nonceBuffer.subarray(0, 12);

    // Decrypt
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = decipher.update(actualCiphertext);

    try {
      const final = decipher.final();
      return Buffer.concat([plaintext, final]).toString("utf8");
    } catch (error) {
      throw new CryptographyError({
        message: "Invalid ciphertext or keys"
      });
    }
  };

  return {
    generateKeyPair,
    encryptAsymmetric,
    decryptAsymmetric
  };
};
