import crypto from "crypto";

import jsrp from "jsrp";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

type TUserPassKey = {
  protectedKey: string;
  protectedKeyTag: string;
  protectedKeyIV: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  publicKey: string;
  verifier: string;
  salt: string;
  privateKey: string;
};

export const generateUserPassKey = async (email: string, password: string) => {
  const pair = nacl.box.keyPair();
  const secretKeyUint8Array = pair.secretKey;
  const publicKeyUint8Array = pair.publicKey;
  const privateKey = encodeBase64(secretKeyUint8Array);
  const publicKey = encodeBase64(publicKeyUint8Array);
  return new Promise<TUserPassKey>((resolve, reject) => {
    client.init({ username: email, password }, () => {
      client.createVerifier(
        async (err: any, { salt, verifier }: { salt: string; verifier: string }) => {
          if (err) {
            return reject(err);
          }

          try {
            // TODO: moduralize into KeyService
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

            return resolve({
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
            });
          } catch (error) {
            return reject(error);
          }
        }
      );
    });
  });
};
