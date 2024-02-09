/* eslint-disable import/no-mutable-exports */
import crypto from "node:crypto";

import argon2, { argon2id } from "argon2";
import jsrp from "jsrp";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import {
  // decryptAsymmetric,
  decryptSymmetric,
  encryptAsymmetric,
  encryptSymmetric
} from "@app/lib/crypto";

import { TUserEncryptionKeys } from "./schemas";

export let userPrivateKey: string | undefined;
export let userPublicKey: string | undefined;

export const seedData1 = {
  id: "3dafd81d-4388-432b-a4c5-f735616868c1",
  email: process.env.TEST_USER_EMAIL || "test@localhost.local",
  password: process.env.TEST_USER_PASSWORD || "testInfisical@1",
  organization: {
    id: "180870b7-f464-4740-8ffe-9d11c9245ea7",
    name: "infisical"
  },
  project: {
    id: "77fa7aed-9288-401e-a4c9-3a9430be62a0",
    name: "first project",
    slug: "first-project"
  },
  environment: {
    name: "Development",
    slug: "dev"
  },
  token: {
    id: "a9dfafba-a3b7-42e3-8618-91abb702fd36"
  },

  // We set these values during user creation, and later re-use them during project seeding.
  encryptionKeys: {
    publicKey: "",
    privateKey: ""
  }
};

export const generateUserSrpKeys = async (password: string) => {
  const pair = nacl.box.keyPair();
  const secretKeyUint8Array = pair.secretKey;
  const publicKeyUint8Array = pair.publicKey;
  const privateKey = encodeBase64(secretKeyUint8Array);
  const publicKey = encodeBase64(publicKeyUint8Array);

  // eslint-disable-next-line
  const client = new jsrp.client();
  await new Promise((resolve) => {
    client.init({ username: seedData1.email, password: seedData1.password }, () => resolve(null));
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
    type: argon2id,
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

export const getUserPrivateKey = async (password: string, user: TUserEncryptionKeys) => {
  const derivedKey = await argon2.hash(password, {
    salt: Buffer.from(user.salt),
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
    type: argon2id,
    raw: true
  });
  if (!derivedKey) throw new Error("Failed to derive key from password");
  const key = decryptSymmetric({
    ciphertext: user.protectedKey as string,
    iv: user.protectedKeyIV as string,
    tag: user.protectedKeyTag as string,
    key: derivedKey.toString("base64")
  });
  const privateKey = decryptSymmetric({
    ciphertext: user.encryptedPrivateKey,
    iv: user.iv,
    tag: user.tag,
    key
  });
  return privateKey;
};

export const buildUserProjectKey = async (privateKey: string, publickey: string) => {
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const { nonce, ciphertext } = encryptAsymmetric(randomBytes, publickey, privateKey);
  return { nonce, ciphertext };
};

// export const getUserProjectKey = async (privateKey: string) => {
//   const key = decryptAsymmetric({
//     ciphertext: decryptFileKey.encryptedKey,
//     nonce: decryptFileKey.nonce,
//     publicKey: decryptFileKey.sender.publicKey,
//     privateKey: PRIVATE_KEY
//   });
// };
