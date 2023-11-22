import crypto from "crypto";

import jsrp from "jsrp";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";
import { issueBackupPrivateKey, srp1 } from "@app/hooks/api/auth/queries";

export const generateUserBackupKey = async (email: string, password: string) => {
  // eslint-disable-next-line new-cap
  const clientKey = new jsrp.client();
  // eslint-disable-next-line new-cap
  const clientPassword = new jsrp.client();

  await new Promise((resolve) => {
    clientPassword.init({ username: email, password }, () => resolve(null));
  });
  const clientPublicKey = clientPassword.getPublicKey();
  const srpKeys = await srp1({ clientPublicKey });
  clientPassword.setSalt(srpKeys.salt);
  clientPassword.setServerPublicKey(srpKeys.serverPublicKey);

  const clientProof = clientPassword.getProof(); // called M1
  const generatedKey = crypto.randomBytes(16).toString("hex");

  await new Promise((resolve) => {
    clientKey.init({ username: email, password: generatedKey }, () => resolve(null));
  });

  const { salt, verifier } = await new Promise<{ salt: string; verifier: string }>(
    (resolve, reject) => {
      clientKey.createVerifier((err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    }
  );
  const { ciphertext, iv, tag } = Aes256Gcm.encrypt({
    text: String(localStorage.getItem("PRIVATE_KEY")),
    secret: generatedKey
  });

  await issueBackupPrivateKey({
    encryptedPrivateKey: ciphertext,
    iv,
    tag,
    salt,
    verifier,
    clientProof
  });

  return generatedKey;
};

export const generateUserPassKey = async (email: string, password: string) => {
  // eslint-disable-next-line new-cap
  const client = new jsrp.client();

  const pair = nacl.box.keyPair();
  const secretKeyUint8Array = pair.secretKey;
  const publicKeyUint8Array = pair.publicKey;
  const privateKey = encodeBase64(secretKeyUint8Array);
  const publicKey = encodeBase64(publicKeyUint8Array);

  await new Promise((resolve) => {
    client.init({ username: email, password }, () => resolve(null));
  });
  const { salt, verifier } = await new Promise<{ salt: string; verifier: string }>(
    (resolve, reject) => {
      client.createVerifier((err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    }
  );

  const derivedKey = await deriveArgonKey({
    password,
    salt,
    mem: 65536,
    time: 3,
    parallelism: 1,
    hashLen: 32
  });

  if (!derivedKey) throw new Error("Failed to derive key from password");

  const key = crypto.randomBytes(32);

  // create encrypted private key by encrypting the private
  // key with the symmetric key [key]
  const {
    ciphertext: encryptedPrivateKey,
    iv: encryptedPrivateKeyIV,
    tag: encryptedPrivateKeyTag
  } = Aes256Gcm.encrypt({
    text: privateKey,
    secret: key
  });

  // create the protected key by encrypting the symmetric key
  // [key] with the derived key
  const {
    ciphertext: protectedKey,
    iv: protectedKeyIV,
    tag: protectedKeyTag
  } = Aes256Gcm.encrypt({
    text: key.toString("hex"),
    secret: Buffer.from(derivedKey.hash)
  });

  return {
    protectedKey,
    protectedKeyTag,
    protectedKeyIV,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    publicKey,
    verifier,
    salt,
    privateKey
  };
};
