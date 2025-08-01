import crypto from "crypto";

import jsrp from "jsrp";

import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey, generateKeyPair } from "@app/components/utilities/cryptography/crypto";

export const generateUserPassKey = async (
  email: string,
  password: string,
  fipsEnabled: boolean
) => {
  // eslint-disable-next-line new-cap
  const client = new jsrp.client();

  const { publicKey, privateKey } = await generateKeyPair(fipsEnabled);

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
