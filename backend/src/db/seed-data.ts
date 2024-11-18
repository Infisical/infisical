/* eslint-disable import/no-mutable-exports */
import crypto from "node:crypto";

import argon2, { argon2id } from "argon2";
import jsrp from "jsrp";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import {
  decryptAsymmetric,
  // decryptAsymmetric,
  decryptSymmetric128BitHexKeyUTF8,
  encryptAsymmetric,
  encryptSymmetric128BitHexKeyUTF8
} from "@app/lib/crypto";

import { TSecrets, TUserEncryptionKeys } from "./schemas";

export let userPrivateKey: string | undefined;
export let userPublicKey: string | undefined;

export const seedData1 = {
  id: "3dafd81d-4388-432b-a4c5-f735616868c1",
  username: process.env.TEST_USER_USERNAME || "test@localhost.local",
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
  projectV3: {
    id: "77fa7aed-9288-401e-a4c9-3a9430be62a4",
    name: "first project v2",
    slug: "first-project-v2"
  },
  environment: {
    name: "Development",
    slug: "dev"
  },
  machineIdentity: {
    id: "88fa7aed-9288-401e-a4c9-fa9430be62a0",
    name: "mac1",
    clientCredentials: {
      id: "3f6135db-f237-421d-af66-a8f4e80d443b",
      secret: "da35a5a5a7b57f977a9a73394506e878a7175d06606df43dc93e1472b10cf339"
    }
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
  } = encryptSymmetric128BitHexKeyUTF8(privateKey, key);

  // create the protected key by encrypting the symmetric key
  // [key] with the derived key
  const {
    ciphertext: protectedKey,
    iv: protectedKeyIV,
    tag: protectedKeyTag
  } = encryptSymmetric128BitHexKeyUTF8(key.toString("hex"), derivedKey);

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

  const key = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: user.protectedKey as string,
    iv: user.protectedKeyIV as string,
    tag: user.protectedKeyTag as string,
    key: derivedKey
  });

  const privateKey = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: user.encryptedPrivateKey,
    iv: user.iv,
    tag: user.tag,
    key: Buffer.from(key, "hex")
  });
  return privateKey;
};

export const buildUserProjectKey = (privateKey: string, publickey: string) => {
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const { nonce, ciphertext } = encryptAsymmetric(randomBytes, publickey, privateKey);
  return { nonce, ciphertext };
};

export const getUserProjectKey = async (privateKey: string, ciphertext: string, nonce: string, publicKey: string) => {
  return decryptAsymmetric({
    ciphertext,
    nonce,
    publicKey,
    privateKey
  });
};

export const encryptSecret = (encKey: string, key: string, value?: string, comment?: string) => {
  // encrypt key
  const {
    ciphertext: secretKeyCiphertext,
    iv: secretKeyIV,
    tag: secretKeyTag
  } = encryptSymmetric128BitHexKeyUTF8(key, encKey);

  // encrypt value
  const {
    ciphertext: secretValueCiphertext,
    iv: secretValueIV,
    tag: secretValueTag
  } = encryptSymmetric128BitHexKeyUTF8(value ?? "", encKey);

  // encrypt comment
  const {
    ciphertext: secretCommentCiphertext,
    iv: secretCommentIV,
    tag: secretCommentTag
  } = encryptSymmetric128BitHexKeyUTF8(comment ?? "", encKey);

  return {
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretCommentCiphertext,
    secretCommentIV,
    secretCommentTag
  };
};

export const decryptSecret = (decryptKey: string, encSecret: TSecrets) => {
  const secretKey = decryptSymmetric128BitHexKeyUTF8({
    key: decryptKey,
    ciphertext: encSecret.secretKeyCiphertext,
    tag: encSecret.secretKeyTag,
    iv: encSecret.secretKeyIV
  });

  const secretValue = decryptSymmetric128BitHexKeyUTF8({
    key: decryptKey,
    ciphertext: encSecret.secretValueCiphertext,
    tag: encSecret.secretValueTag,
    iv: encSecret.secretValueIV
  });

  const secretComment =
    encSecret.secretCommentIV && encSecret.secretCommentTag && encSecret.secretCommentCiphertext
      ? decryptSymmetric128BitHexKeyUTF8({
          key: decryptKey,
          ciphertext: encSecret.secretCommentCiphertext,
          tag: encSecret.secretCommentTag,
          iv: encSecret.secretCommentIV
        })
      : "";

  return {
    key: secretKey,
    value: secretValue,
    comment: secretComment,
    version: encSecret.version
  };
};
