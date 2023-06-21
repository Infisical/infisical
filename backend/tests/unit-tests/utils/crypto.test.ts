import { describe, expect, test } from "@jest/globals";
import {
  decryptAsymmetric,
  encryptAsymmetric,
} from "../../../src/utils/crypto";

describe("Crypto", () => {
  describe("encryptAsymmetric", () => {
    describe("given all valid publicKey, privateKey and plaintext", () => {
      const publicKey = "6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=";
      const privateKey = "Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=";
      const plaintext = "secret-message";

      test("should encrypt plain text", () => {
        const result = encryptAsymmetric({ plaintext, publicKey, privateKey });
        expect(result.ciphertext).toBeDefined();
        expect(result.nonce).toBeDefined();
      });
    });

    describe("given empty/undefined publicKey", () => {
      let publicKey: string;
      const privateKey = "Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=";
      const plaintext = "secret-message";

      test("should throw error if publicKey is undefined", () => {
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError("invalid encoding");
      });

      test("should throw error if publicKey is empty string", () => {
        publicKey = "";
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError("bad public key size");
      });
    });

    describe("given empty/undefined privateKey", () => {
      const publicKey = "6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=";
      let privateKey: string;
      const plaintext = "secret-message";

      test("should throw error if privateKey is undefined", () => {
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError("invalid encoding");
      });

      test("should throw error if privateKey is empty string", () => {
        privateKey = "";
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError("bad secret key size");
      });
    });

    describe("given undefined/invalid plaint text", () => {
      const publicKey = "6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=";
      const privateKey = "Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=";
      let plaintext: string;

      test("should throw error if plaintext is undefined", () => {
        expect(() => {
          encryptAsymmetric({ plaintext, publicKey, privateKey });
        }).toThrowError("expected string");
      });

      test("should encrypt plaintext containing special characters", () => {
        plaintext = "131@#$%235!@#&*(&123sadfkjadjf";
        const result = encryptAsymmetric({
          plaintext,
          publicKey,
          privateKey,
        });
        expect(result.ciphertext).toBeDefined();
        expect(result.nonce).toBeDefined();
      });
    });
  });

  describe("decryptAsymmetric", () => {
    describe("given all valid publicKey, privateKey and plaintext", () => {
      const publicKey = "6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=";
      const privateKey = "Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=";
      const plaintext = "secret-message";

      test("should decrypt the encrypted plaintext", () => {
        const encryptedResult = encryptAsymmetric({
          plaintext,
          publicKey,
          privateKey,
        });
        const ciphertext = encryptedResult.ciphertext;
        const nonce = encryptedResult.nonce;

        const decryptedResult = decryptAsymmetric({
          ciphertext,
          nonce,
          publicKey,
          privateKey,
        });

        expect(decryptedResult).toBeDefined();
        expect(decryptedResult).toEqual(plaintext);
      });
    });

    describe("given ciphertext or nonce is modified before decrypt", () => {
      const publicKey = "6U5m6S5jlyazJ+R4z7Yf/Ah4th4JwKxDN8Wn7+upvzw=";
      const privateKey = "Z8W53YV+2ddjJCrFwzptjK96y2QsQI9oXuvfcx+qxz0=";
      const plaintext = "secret-message";

      test("should throw error if ciphertext is modified", () => {
        const encryptedResult = encryptAsymmetric({
          plaintext,
          publicKey,
          privateKey,
        });
        const ciphertext = "=12adfJ@#52af1231=123"; // modified
        const nonce = encryptedResult.nonce;

        expect(() => {
          decryptAsymmetric({
            ciphertext,
            nonce,
            publicKey,
            privateKey,
          });
        }).toThrowError("invalid encoding");
      });

      test("should throw error if nonce is modified", () => {
        const encryptedResult = encryptAsymmetric({
          plaintext,
          publicKey,
          privateKey,
        });
        const ciphertext = encryptedResult.ciphertext;
        const nonce = "=12adfJ@#52af1231=123"; // modified

        expect(() => {
          decryptAsymmetric({
            ciphertext,
            nonce,
            publicKey,
            privateKey,
          });
        }).toThrowError("invalid encoding");
      });
    });
  });
});
