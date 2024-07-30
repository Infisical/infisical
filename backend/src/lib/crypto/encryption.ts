import crypto from "node:crypto";

import argon2 from "argon2";
import nacl from "tweetnacl";
import naclUtils from "tweetnacl-util";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";

import { getConfig } from "../config/env";

export const decodeBase64 = (s: string) => naclUtils.decodeBase64(s);
export const encodeBase64 = (u: Uint8Array) => naclUtils.encodeBase64(u);

export const randomSecureBytes = (length = 32) => crypto.randomBytes(length);

export type TDecryptSymmetricInput = {
  ciphertext: string;
  iv: string;
  tag: string;
  key: string;
};
export const IV_BYTES_SIZE = 12;
export const BLOCK_SIZE_BYTES_16 = 16;

export const decryptSymmetric = ({ ciphertext, iv, tag, key }: TDecryptSymmetricInput): string => {
  const secretKey = crypto.createSecretKey(key, "base64");

  const decipher = crypto.createDecipheriv(SecretEncryptionAlgo.AES_256_GCM, secretKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  let cleartext = decipher.update(ciphertext, "base64", "utf8");
  cleartext += decipher.final("utf8");

  return cleartext;
};

export const encryptSymmetric = (plaintext: string, key: string) => {
  const iv = crypto.randomBytes(IV_BYTES_SIZE);

  const secretKey = crypto.createSecretKey(key, "base64");
  const cipher = crypto.createCipheriv(SecretEncryptionAlgo.AES_256_GCM, secretKey, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");

  return {
    ciphertext,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
};

export const encryptSymmetric128BitHexKeyUTF8 = (plaintext: string, key: string | Buffer) => {
  const iv = crypto.randomBytes(BLOCK_SIZE_BYTES_16);
  const cipher = crypto.createCipheriv(SecretEncryptionAlgo.AES_256_GCM, key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");

  return {
    ciphertext,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
};

export const decryptSymmetric128BitHexKeyUTF8 = ({
  ciphertext,
  iv,
  tag,
  key
}: Omit<TDecryptSymmetricInput, "key"> & { key: string | Buffer }): string => {
  const decipher = crypto.createDecipheriv(SecretEncryptionAlgo.AES_256_GCM, key, Buffer.from(iv, "base64"));

  decipher.setAuthTag(Buffer.from(tag, "base64"));

  let cleartext = decipher.update(ciphertext, "base64", "utf8");
  cleartext += decipher.final("utf8");

  return cleartext;
};

export const encryptAsymmetric = (plaintext: string, publicKey: string, privateKey: string) => {
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    naclUtils.decodeUTF8(plaintext),
    nonce,
    naclUtils.decodeBase64(publicKey),
    naclUtils.decodeBase64(privateKey)
  );

  return {
    ciphertext: naclUtils.encodeBase64(ciphertext),
    nonce: naclUtils.encodeBase64(nonce)
  };
};

export type TDecryptAsymmetricInput = {
  ciphertext: string;
  nonce: string;
  publicKey: string;
  privateKey: string;
};

export const decryptAsymmetric = ({ ciphertext, nonce, publicKey, privateKey }: TDecryptAsymmetricInput) => {
  const plaintext: Uint8Array | null = nacl.box.open(
    naclUtils.decodeBase64(ciphertext),
    naclUtils.decodeBase64(nonce),
    naclUtils.decodeBase64(publicKey),
    naclUtils.decodeBase64(privateKey)
  );

  if (plaintext == null) throw Error("Invalid ciphertext or keys");

  return naclUtils.encodeUTF8(plaintext);
};

export const generateSymmetricKey = (size = 32) => crypto.randomBytes(size).toString("base64");

export const generateHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export const generateAsymmetricKeyPair = () => {
  const pair = nacl.box.keyPair();

  return {
    publicKey: naclUtils.encodeBase64(pair.publicKey),
    privateKey: naclUtils.encodeBase64(pair.secretKey)
  };
};

export type TGenSecretBlindIndex = {
  secretName: string;
  keyEncoding: SecretKeyEncoding;
  rootEncryptionKey?: string;
  encryptionKey?: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export const buildSecretBlindIndexFromName = async ({
  secretName,
  ciphertext,
  keyEncoding,
  iv,
  tag,
  encryptionKey,
  rootEncryptionKey
}: TGenSecretBlindIndex) => {
  if (!encryptionKey && !rootEncryptionKey) throw new Error("Missing secret blind index key");
  let salt = "";
  if (rootEncryptionKey && keyEncoding === SecretKeyEncoding.BASE64) {
    salt = decryptSymmetric({ iv, ciphertext, key: rootEncryptionKey, tag });
  } else if (encryptionKey && keyEncoding === SecretKeyEncoding.UTF8) {
    salt = decryptSymmetric128BitHexKeyUTF8({ iv, ciphertext, key: encryptionKey, tag });
  }
  if (!salt) throw new Error("Missing secret blind index key");

  const secretBlindIndex = await argon2.hash(secretName, {
    type: argon2.argon2id,
    salt: Buffer.from(salt, "base64"),
    saltLength: 16, // default 16 bytes
    memoryCost: 65536, // default pool of 64 MiB per thread.
    hashLength: 32,
    parallelism: 1,
    raw: true
  });

  return secretBlindIndex.toString("base64");
};

export const createSecretBlindIndex = (rootEncryptionKey?: string, encryptionKey?: string) => {
  if (!encryptionKey && !rootEncryptionKey) throw new Error("Atleast one encryption key needed");
  const salt = crypto.randomBytes(16).toString("base64");
  if (rootEncryptionKey) {
    const data = encryptSymmetric(salt, rootEncryptionKey);
    return {
      ...data,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      keyEncoding: SecretKeyEncoding.BASE64
    };
  }
  if (encryptionKey) {
    const data = encryptSymmetric128BitHexKeyUTF8(salt, encryptionKey);
    return {
      ...data,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      keyEncoding: SecretKeyEncoding.UTF8
    };
  }
  throw new Error("Failed to generate blind index due to encryption key missing");
};

export const infisicalSymmetricEncypt = (data: string) => {
  const appCfg = getConfig();
  const rootEncryptionKey = appCfg.ROOT_ENCRYPTION_KEY;
  const encryptionKey = appCfg.ENCRYPTION_KEY;
  if (rootEncryptionKey) {
    const { iv, tag, ciphertext } = encryptSymmetric(data, rootEncryptionKey);
    return {
      iv,
      tag,
      ciphertext,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      encoding: SecretKeyEncoding.BASE64
    };
  }
  if (encryptionKey) {
    const { iv, tag, ciphertext } = encryptSymmetric128BitHexKeyUTF8(data, encryptionKey);
    return {
      iv,
      tag,
      ciphertext,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      encoding: SecretKeyEncoding.UTF8
    };
  }
  throw new Error("Missing both encryption keys");
};

export const infisicalSymmetricDecrypt = <T = string>({
  keyEncoding,
  ciphertext,
  tag,
  iv
}: Omit<TDecryptSymmetricInput, "key"> & {
  keyEncoding: SecretKeyEncoding;
}) => {
  const appCfg = getConfig();
  // the or gate is used used in migration
  const rootEncryptionKey = appCfg?.ROOT_ENCRYPTION_KEY || process.env.ROOT_ENCRYPTION_KEY;
  const encryptionKey = appCfg?.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (rootEncryptionKey && keyEncoding === SecretKeyEncoding.BASE64) {
    const data = decryptSymmetric({ key: rootEncryptionKey, iv, tag, ciphertext });
    return data as T;
  }
  if (encryptionKey && keyEncoding === SecretKeyEncoding.UTF8) {
    const data = decryptSymmetric128BitHexKeyUTF8({ key: encryptionKey, iv, tag, ciphertext });
    return data as T;
  }
  throw new Error("Missing both encryption keys");
};
