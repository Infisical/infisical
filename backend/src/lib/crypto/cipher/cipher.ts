import crypto from "crypto";

import { SymmetricKeyAlgorithm, TSymmetricEncryptionFns } from "./types";

const getIvLength = () => {
  return 12;
};

const getTagLength = () => {
  return 16;
};

export const symmetricCipherService = (
  type: SymmetricKeyAlgorithm.AES_GCM_128 | SymmetricKeyAlgorithm.AES_GCM_256
): TSymmetricEncryptionFns => {
  const IV_LENGTH = getIvLength();
  const TAG_LENGTH = getTagLength();

  const encrypt = (text: Buffer, key: Buffer) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(type, key, iv);

    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get the authentication tag
    const tag = cipher.getAuthTag();

    // Concatenate IV, encrypted text, and tag into a single buffer
    const ciphertextBlob = Buffer.concat([iv, encrypted, tag]);
    return ciphertextBlob;
  };

  const decrypt = (ciphertextBlob: Buffer, key: Buffer) => {
    // Extract the IV, encrypted text, and tag from the buffer
    const iv = ciphertextBlob.subarray(0, IV_LENGTH);
    const tag = ciphertextBlob.subarray(-TAG_LENGTH);
    const encrypted = ciphertextBlob.subarray(IV_LENGTH, -TAG_LENGTH);

    const decipher = crypto.createDecipheriv(type, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted;
  };

  return {
    encrypt,
    decrypt
  };
};
