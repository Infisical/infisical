import { describe, test, expect } from '@jest/globals';
import {
  decryptAsymmetric,
  decryptSymmetric,
  encryptAsymmetric,
  encryptSymmetric
} from '../../../src/utils/crypto';

describe('Crypto', () => {
  describe('encryptAsymmetric', () => {
    describe('given all valid publicKey, privateKey and plaintext', () => {
      const publicKey = '6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=';
      const privateKey = 'Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=';
      const plaintext = 'secret-message';

      test('should encrypt plain text', () => {
        const result = encryptAsymmetric({ plaintext, publicKey, privateKey });
        expect(result.ciphertext).toBeDefined();
        expect(result.nonce).toBeDefined();
      });
    });

    describe('given empty/undefined publicKey', () => {
      let publicKey: string;
      const privateKey = 'Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=';
      const plaintext = 'secret-message';

      test('should throw error if publicKey is undefined', () => {
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError('invalid encoding');
      });

      test('should throw error if publicKey is empty string', () => {
        publicKey = '';
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError('bad public key size');
      });
    });

    describe('given empty/undefined privateKey', () => {
      const publicKey = '6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=';
      let privateKey: string;
      const plaintext = 'secret-message';

      test('should throw error if privateKey is undefined', () => {
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError('invalid encoding');
      });

      test('should throw error if privateKey is empty string', () => {
        privateKey = '';
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError('bad secret key size');
      });
    });

    describe('given undefined/invalid plaint text', () => {
      const publicKey = '6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=';
      const privateKey = 'Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=';
      let plaintext: string;

      test('should throw error if plaintext is undefined', () => {
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError('expected string');
      });

      test('should encrypt plaintext containing special characters', () => {
        plaintext = '131@#$%235!@#&*(&123sadfkjadjf';
        const result = encryptAsymmetric({
          plaintext,
          publicKey,
          privateKey
        });
        expect(result.ciphertext).toBeDefined();
        expect(result.nonce).toBeDefined();
      });
    });
  });

  describe('decryptAsymmetric', () => {
    describe('given all valid publicKey, privateKey and plaintext', () => {
      const publicKey = '6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=';
      const privateKey = 'Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=';
      const plaintext = 'secret-message';

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

    describe('given ciphertext or nonce is modified before decrypt', () => {
      const publicKey = '6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=';
      const privateKey = 'Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=';
      const plaintext = 'secret-message';

      test('should throw error if ciphertext is modified', () => {
        const encryptedResult = encryptAsymmetric({
          plaintext,
          publicKey,
          privateKey
        });
        const ciphertext = '=12adfJ@#52af1231=123'; // modified
        const nonce = encryptedResult.nonce;

        expect(() => {
          decryptAsymmetric({
            ciphertext,
            nonce,
            publicKey,
            privateKey
          });
        }).toThrowError('invalid encoding');
      });

      test('should throw error if nonce is modified', () => {
        const encryptedResult = encryptAsymmetric({
          plaintext,
          publicKey,
          privateKey
        });
        const ciphertext = encryptedResult.ciphertext;
        const nonce = '=12adfJ@#52af1231=123'; // modified

        expect(() => {
          decryptAsymmetric({
            ciphertext,
            nonce,
            publicKey,
            privateKey
          });
        }).toThrowError('invalid encoding');
      });
    });
  });

  describe('encryptSymmetric', () => {
    let plaintext: string;
    const key = '7e8ee7e5cc667b9c1829783ad31f36f4';

    test('should encrypt plaintext with the given key', () => {
      plaintext = 'secret-message';
      const { ciphertext, iv, tag } = encryptSymmetric({ plaintext, key });
      expect(ciphertext).toBeDefined();
      expect(iv).toBeDefined();
      expect(tag).toBeDefined();
    });

    test('should throw an error when plaintext is undefined', () => {
      const invalidKey = 'invalid-key';
      expect(() => {
        encryptSymmetric({ plaintext, key: invalidKey });
      }).toThrowError('Invalid key length');
    });

    test('should throw an error when invalid key is provided', () => {
      plaintext = 'secret-message';
      const invalidKey = 'invalid-key';

      expect(() => {
        encryptSymmetric({ plaintext, key: invalidKey });
      }).toThrowError('Invalid key length');
    });
  });

  describe('decryptSymmetric', () => {
    const plaintext = 'secret-message';
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

    test('should fail if ciphertext is modified', () => {
      const modifieldCiphertext = 'abcdefghijklmnopqrstuvwxyz';
      expect(() => {
        decryptSymmetric({
          ciphertext: modifieldCiphertext,
          iv,
          tag,
          key
        });
      }).toThrowError('Unsupported state or unable to authenticate data');
    });

    test('should fail if iv is modified', () => {
      const modifiedIv = 'abcdefghijklmnopqrstuvwxyz';
      expect(() => {
        decryptSymmetric({
          ciphertext,
          iv: modifiedIv,
          tag,
          key
        });
      }).toThrowError('Unsupported state or unable to authenticate data');
    });

    test('should fail if tag is modified', () => {
      const modifiedTag = 'abcdefghijklmnopqrstuvwxyz';
      expect(() => {
        decryptSymmetric({
          ciphertext,
          iv,
          tag: modifiedTag,
          key
        });
      }).toThrowError(/Invalid authentication tag length: \d+/);
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
      }).toThrowError('Invalid key length');
    });
  });
});
