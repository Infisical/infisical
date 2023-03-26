import { describe, test, expect } from '@jest/globals';
import {
  decryptAsymmetric,
  decryptSymmetric,
  encryptAsymmetric,
  encryptSymmetric
} from '../../src/utils/crypto';

describe('Crypto', () => {
  const publicKey = '6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=';
  const privateKey = 'Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=';
  const plaintext = 'secret-message';

  describe('encryptAsymmetric', () => {
    test('should encrypt plain text', () => {
      const result = encryptAsymmetric({ plaintext, publicKey, privateKey });
      expect(result.ciphertext).toBeDefined();
      expect(result.nonce).toBeDefined();
    });
  });

  describe('decryptAsymmetric', () => {
    test('should decrypt the encrypted plaintext', () => {
      const encryptedResult = encryptAsymmetric({
        plaintext,
        publicKey,
        privateKey
      });
      const ciphertext = encryptedResult.ciphertext;
      const nonce = encryptedResult.nonce;

      const decryptedResult = decryptAsymmetric({
        ciphertext,
        nonce,
        publicKey,
        privateKey
      });

      expect(decryptedResult).toBeDefined();
      expect(decryptedResult).toEqual(plaintext);
    });
  });

  describe('encryptSymmetric', () => {
    const plaintext = 'secret-message';
    const key = '7e8ee7e5cc667b9c1829783ad31f36f4';

    test('should encrypt plaintext with the given key', () => {
      const { ciphertext, iv, tag } = encryptSymmetric({ plaintext, key });
      expect(ciphertext).toBeDefined();
      expect(iv).toBeDefined();
      expect(tag).toBeDefined();
    });

    test('should throw an error when encryption fails', () => {
      const invalidKey = 'invalid-key';

      expect(() => {
        encryptSymmetric({ plaintext, key: invalidKey });
      }).toThrowError();
    });
  });

  describe('decryptSymmetric', () => {
    const key = '7e8ee7e5cc667b9c1829783ad31f36f4';
    const { ciphertext, iv, tag } = encryptSymmetric({ plaintext, key });

    test('should decrypt encrypted plaintext', () => {
      const result = decryptSymmetric({
        ciphertext,
        iv,
        tag,
        key
      });

      expect(result).toBeDefined();
      expect(result).toEqual(plaintext);
    });

    test('should throw an error when decryption fails', () => {
      const invalidKey = 'invalid-key';
      expect(() => {
        decryptSymmetric({
          ciphertext,
          iv,
          tag,
          key: invalidKey
        });
      }).toThrowError();
    });
  });
});
