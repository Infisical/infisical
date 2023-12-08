/**
 * @fileoverview Provides easy encryption/decryption methods using AES 256 GCM.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const BLOCK_SIZE_BYTES = 16; // 128 bit

interface EncryptProps {
  text: string;
  secret: string | Buffer;
}

interface DecryptProps {
  ciphertext: string;
  iv: string;
  tag: string;
  secret: string | Buffer;
}

interface EncryptOutputProps {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Provides easy encryption/decryption methods using AES 256 GCM.
 */
class Aes256Gcm {
  /**
   * No need to run the constructor. The class only has static methods.
   */

  /**
   * Encrypts text with AES 256 GCM.
   * @param {object} obj
   * @param {string} obj.text - Cleartext to encode.
   * @param {string} obj.secret - Shared secret key, must be 32 bytes.
   * @returns {object}
   */
  // { ciphertext: string; iv: string; tag: string; }
  static encrypt({ text, secret }: EncryptProps): EncryptOutputProps {
    const iv = crypto.randomBytes(BLOCK_SIZE_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, secret, iv);

    let ciphertext = cipher.update(text, "utf8", "base64");
    ciphertext += cipher.final("base64");
    return {
      ciphertext,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64")
    };
  }

  /**
   * Decrypts AES 256 CGM encrypted text.
   * @param {object} obj
   * @param {string} obj.ciphertext - Base64-encoded ciphertext.
   * @param {string} obj.iv - The base64-encoded initialization vector.
   * @param {string} obj.tag - The base64-encoded authentication tag generated by getAuthTag().
   * @param {string} obj.secret - Shared secret key, must be 32 bytes.
   * @returns {string}
   */
  static decrypt({ ciphertext, iv, tag, secret }: DecryptProps): string {
    const decipher = crypto.createDecipheriv(ALGORITHM, secret, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    let cleartext = decipher.update(ciphertext, "base64", "utf8");
    cleartext += decipher.final("utf8");

    return cleartext;
  }
}

export default Aes256Gcm;
