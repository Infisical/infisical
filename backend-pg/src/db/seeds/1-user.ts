import crypto from "node:crypto";

import argon2, { argon2id } from "argon2";
import jsrp from "jsrp";
import { Knex } from "knex";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import { encryptSymmetric } from "@app/lib/crypto";

import { AuthMethod } from "../../services/auth/auth-type";
import { TableName } from "../schemas";
import { seedData1 } from "../seed-data";

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
  const { salt, verifier } = await new Promise<{ salt: string; verifier: string }>(
    (resolve, reject) => {
      client.createVerifier((err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    }
  );
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

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Users).del();
  await knex(TableName.UserEncryptionKey).del();
  await knex(TableName.SuperAdmin).del();
  await knex(TableName.SuperAdmin).insert([{ initialized: true, allowSignUp: true }]);
  // Inserts seed entries
  const [user] = await knex(TableName.Users)
    .insert([
      {
        // @ts-ignore to calculate predefined
        id: seedData1.id,
        email: seedData1.email,
        superAdmin: true,
        firstName: "test",
        lastName: "",
        authMethods: [AuthMethod.EMAIL],
        isAccepted: true,
        isMfaEnabled: false,
        mfaMethods: null,
        devices: null
      }
    ])
    .returning("*");

  const encKeys = await generateUserSrpKeys(seedData1.password);
  // password: testInfisical@1
  await knex(TableName.UserEncryptionKey).insert([
    {
      encryptionVersion: 2,
      protectedKey: encKeys.protectedKey,
      protectedKeyIV: encKeys.protectedKeyIV,
      protectedKeyTag: encKeys.protectedKeyTag,
      publicKey: encKeys.publicKey,
      encryptedPrivateKey: encKeys.encryptedPrivateKey,
      iv: encKeys.encryptedPrivateKeyIV,
      tag: encKeys.encryptedPrivateKeyTag,
      salt: encKeys.salt,
      verifier: encKeys.verifier,
      userId: user.id
    }
  ]);

  await knex(TableName.AuthTokenSession).insert({
    // @ts-ignore
    id: seedData1.token.id,
    userId: seedData1.id,
    ip: "151.196.220.213",
    userAgent:
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36 RuxitSynthetic/1.0 v3690753611340580436 t8052286838287810618",
    accessVersion: 1,
    refreshVersion: 1,
    lastUsed: new Date()
  });
}
