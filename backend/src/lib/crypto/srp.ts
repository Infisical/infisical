import argon2 from "argon2";
import crypto from "crypto";
import jsrp from "jsrp";
import nacl from "tweetnacl";
import tweetnacl from "tweetnacl-util";

import { TUserEncryptionKeys } from "@app/db/schemas";

import { decryptSymmetric128BitHexKeyUTF8, encryptAsymmetric, encryptSymmetric } from "./encryption";

export const generateSrpServerKey = async (salt: string, verifier: string) => {
  // eslint-disable-next-line new-cap
  const server = new jsrp.server();
  await new Promise((resolve) => {
    server.init({ salt, verifier }, () => resolve(null));
  });
  return { pubKey: server.getPublicKey(), privateKey: server.getPrivateKey() };
};

export const srpCheckClientProof = async (
  salt: string,
  verifier: string,
  serverPrivateKey: string,
  clientPublicKey: string,
  clientProof: string
) => {
  // eslint-disable-next-line new-cap
  const server = new jsrp.server();
  await new Promise((resolve) => {
    server.init({ salt, verifier, b: serverPrivateKey }, () => resolve(null));
  });
  server.setClientPublicKey(clientPublicKey);
  return server.checkClientProof(clientProof);
};

// Ghost user related:
// This functionality is intended for ghost user logic. This happens on the frontend when a user is being created.
// We replicate the same functionality on the backend when creating a ghost user.
export const generateUserSrpKeys = async (email: string, password: string) => {
  const pair = nacl.box.keyPair();
  const secretKeyUint8Array = pair.secretKey;
  const publicKeyUint8Array = pair.publicKey;
  const privateKey = tweetnacl.encodeBase64(secretKeyUint8Array);
  const publicKey = tweetnacl.encodeBase64(publicKeyUint8Array);

  // eslint-disable-next-line
  const client = new jsrp.client();
  await new Promise((resolve) => {
    client.init({ username: email, password }, () => resolve(null));
  });
  const { salt, verifier } = await new Promise<{ salt: string; verifier: string }>((resolve, reject) => {
    client.createVerifier((err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
  const derivedKey = await argon2.hash(password, {
    salt: Buffer.from(salt),
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
    type: argon2.argon2id,
    raw: true
  });
  if (!derivedKey) throw new Error("Failed to derive key from password");

  const key = crypto.randomBytes(32);

  // create encrypted private key by encrypting the private
  // key with the symmetric key [key]
  const {
    ciphertext: encryptedPrivateKey,
    iv: encryptedPrivateKeyIV,
    tag: encryptedPrivateKeyTag
  } = encryptSymmetric(privateKey, key.toString("base64"));

  // create the protected key by encrypting the symmetric key
  // [key] with the derived key
  const {
    ciphertext: protectedKey,
    iv: protectedKeyIV,
    tag: protectedKeyTag
  } = encryptSymmetric(key.toString("hex"), derivedKey.toString("base64"));

  return {
    protectedKey,
    plainPrivateKey: privateKey,
    protectedKeyIV,
    protectedKeyTag,
    publicKey,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    salt,
    verifier
  };
};

export const getUserPrivateKey = async (
  password: string,
  user: Pick<
    TUserEncryptionKeys,
    | "protectedKeyTag"
    | "protectedKey"
    | "protectedKeyIV"
    | "encryptedPrivateKey"
    | "iv"
    | "salt"
    | "tag"
    | "encryptionVersion"
  >
) => {
  if (user.encryptionVersion === 1) {
    return decryptSymmetric128BitHexKeyUTF8({
      ciphertext: user.encryptedPrivateKey,
      iv: user.iv,
      tag: user.tag,
      key: password.slice(0, 32).padStart(32 + (password.slice(0, 32).length - new Blob([password]).size), "0")
    });
  }
  if (user.encryptionVersion === 2 && user.protectedKey && user.protectedKeyIV && user.protectedKeyTag) {
    const derivedKey = await argon2.hash(password, {
      salt: Buffer.from(user.salt),
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
      type: argon2.argon2id,
      raw: true
    });
    if (!derivedKey) throw new Error("Failed to derive key from password");
    const key = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: user.protectedKey,
      iv: user.protectedKeyIV,
      tag: user.protectedKeyTag,
      key: derivedKey
    });

    const privateKey = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: user.encryptedPrivateKey,
      iv: user.iv,
      tag: user.tag,
      key: Buffer.from(key, "hex")
    });
    return privateKey;
  }
  throw new Error(`GetUserPrivateKey: Encryption version not found`);
};

export const buildUserProjectKey = async (privateKey: string, publickey: string) => {
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const { nonce, ciphertext } = encryptAsymmetric(randomBytes, publickey, privateKey);
  return { nonce, ciphertext };
};
