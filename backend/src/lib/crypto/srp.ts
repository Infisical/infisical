import argon2, { argon2id } from "argon2";
import crypto from "crypto";
import jsrp from "jsrp";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import { TUserEncryptionKeys } from "@app/db/schemas";

import { decryptSymmetric, encryptAsymmetric, encryptSymmetric } from "./encryption";

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

// FOR GHOST USER STUFF
export const generateUserSrpKeys = async (email: string, password: string) => {
  const pair = nacl.box.keyPair();
  const secretKeyUint8Array = pair.secretKey;
  const publicKeyUint8Array = pair.publicKey;
  const privateKey = encodeBase64(secretKeyUint8Array);
  const publicKey = encodeBase64(publicKeyUint8Array);

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
    ciphertext: user.protectedKey!,
    iv: user.protectedKeyIV!,
    tag: user.protectedKeyTag!,
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
