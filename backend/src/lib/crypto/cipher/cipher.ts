import { crypto } from "@app/lib/crypto/cryptography";

import { SymmetricKeyAlgorithm, TSymmetricEncryptionFns } from "./types";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// todo(daniel): Decide if we should move this into the cryptography module
export const symmetricCipherService = (
  type: SymmetricKeyAlgorithm.AES_GCM_128 | SymmetricKeyAlgorithm.AES_GCM_256
): TSymmetricEncryptionFns => {
  const encrypt = (text: Buffer, key: Buffer) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.nativeCrypto.createCipheriv(type, key, iv);

    const encrypted = cipher.update(text);
    // AES-GCM is unpadded, so final() is always zero-length. Folding it into the single
    // concat below rather than its own avoids a full-size copy of the ciphertext.
    const final = cipher.final();

    // Get the authentication tag
    const tag = cipher.getAuthTag();

    // Concatenate IV, encrypted text, and tag into a single buffer
    const ciphertextBlob = final.length
      ? Buffer.concat([iv, encrypted, final, tag])
      : Buffer.concat([iv, encrypted, tag]);
    return ciphertextBlob;
  };

  const decrypt = (ciphertextBlob: Buffer, key: Buffer) => {
    // Extract the IV, encrypted text, and tag from the buffer
    const iv = ciphertextBlob.subarray(0, IV_LENGTH);
    const tag = ciphertextBlob.subarray(-TAG_LENGTH);
    const encrypted = ciphertextBlob.subarray(IV_LENGTH, -TAG_LENGTH);

    const decipher = crypto.nativeCrypto.createDecipheriv(type, key, iv);
    decipher.setAuthTag(tag);

    // final() must still be called since that is what verifies the auth tag, but AES-GCM is
    // unpadded so it returns zero bytes. Concatenating it would copy the whole plaintext again.
    const decrypted = decipher.update(encrypted);
    const final = decipher.final();
    return final.length ? Buffer.concat([decrypted, final]) : decrypted;
  };

  return {
    encrypt,
    decrypt
  };
};
