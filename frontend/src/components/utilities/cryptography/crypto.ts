// @ts-expect-error to avoid wasm dependencies
// eslint-disable-next-line
import argon2 from "argon2-browser/dist/argon2-bundled.min.js";
import nacl from "tweetnacl";
import { encodeBase64 as naclEncodeBase64 } from "tweetnacl-util";
import aes from "./aes-256-gcm";

const encodeBase64 = (uint8Array: Uint8Array) => btoa(String.fromCharCode(...uint8Array));
const decodeBase64 = (base64String: string) =>
  new Uint8Array([...atob(base64String)].map((c) => c.charCodeAt(0)));

const generateKeyPair = async (fipsEnabled: boolean) => {
  if (fipsEnabled) {
    if (!crypto || !crypto.subtle) {
      throw new Error("Web Crypto API not available");
    }

    // browser version of how the key format we expect on the backend for asymmetric encryption
    const result = await crypto.subtle.generateKey(
      {
        name: "X25519"
      },
      true, // extractable
      ["deriveKey", "deriveBits"]
    );

    // Type guard
    if (!("publicKey" in result)) {
      throw new Error("Expected CryptoKeyPair but got CryptoKey");
    }

    const keyPair = result as CryptoKeyPair;
    const publicKeyBytes = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKeyBytes = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    return {
      publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKeyBytes))),
      privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKeyBytes)))
    };
  }

  const pair = nacl.box.keyPair();
  const secretKeyUint8Array = pair.secretKey;
  const publicKeyUint8Array = pair.publicKey;
  const privateKey = naclEncodeBase64(secretKeyUint8Array);
  const publicKey = naclEncodeBase64(publicKeyUint8Array);

  return {
    publicKey,
    privateKey
  };
};

/**
 * Derive a key from password [password] and salt [salt] using Argon2id
 * @param {Object} obj
 * @param {String} obj.password - password to derive key from
 * @param {String} obj.salt - salt to derive key from
 * @param {Number} obj.mem - used memory, in KiB
 * @param {Number} obj.time - number of iterations
 * @param {Number} obj.parallelism - desired parallelism
 * @param {Number} obj.hashLen - desired hash length (i.e. byte-length of derived key)
 * @returns
 */
const deriveArgonKey = async ({
  password,
  salt,
  mem,
  time,
  parallelism,
  hashLen
}: {
  password: string;
  salt: string;
  mem: number;
  time: number;
  parallelism: number;
  hashLen: number;
}) => {
  let derivedKey;
  try {
    derivedKey = await argon2.hash({
      pass: password,
      salt,
      type: argon2.ArgonType.Argon2id,
      mem,
      time,
      parallelism,
      hashLen
    });
  } catch (err) {
    console.error(err);
  }

  return derivedKey;
};

type EncryptSymmetricProps = {
  plaintext: string;
  key: string;
};

type EncryptSymmetricReturn = {
  ciphertext: string;
  iv: string;
  tag: string;
};
/**
 * Return symmetrically encrypted [plaintext] using [key].
 */
const encryptSymmetric = ({ plaintext, key }: EncryptSymmetricProps): EncryptSymmetricReturn => {
  let ciphertext;
  let iv;
  let tag;
  try {
    const obj = aes.encrypt({ text: plaintext, secret: key });
    ciphertext = obj.ciphertext;
    iv = obj.iv;
    tag = obj.tag;
  } catch (err) {
    console.log("Failed to perform encryption");
    console.log(err);
    process.exit(1);
  }

  return {
    ciphertext,
    iv,
    tag
  };
};

type DecryptSymmetricProps = {
  ciphertext: string;
  iv: string;
  tag: string;
  key: string;
};

/**
 * Return symmetrically decypted [ciphertext] using [iv], [tag],
 * and [key].
 * @param {Object} obj
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.iv - iv
 * @param {String} obj.tag - tag
 * @param {String} obj.key - 32-byte hex key
 *
 */
const decryptSymmetric = ({ ciphertext, iv, tag, key }: DecryptSymmetricProps): string => {
  if (!ciphertext) return "";
  let plaintext;
  try {
    plaintext = aes.decrypt({ ciphertext, iv, tag, secret: key });
  } catch (err) {
    console.log("Failed to decrypt with the following parameters", {
      ciphertext,
      iv,
      tag,
      key
    });
    console.log("Failed to perform decryption", err);

    process.exit(1);
  }

  return plaintext;
};

export {
  decodeBase64,
  decryptSymmetric,
  deriveArgonKey,
  encodeBase64,
  encryptSymmetric,
  generateKeyPair
};
