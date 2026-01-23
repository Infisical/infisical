import argon2 from "argon2";

import { SecretKeyEncoding } from "@app/db/schemas/models";

import { crypto, SymmetricKeySize } from "./cryptography";

type TBuildSecretBlindIndexDTO = {
  secretName: string;
  keyEncoding: SecretKeyEncoding;
  rootEncryptionKey?: string;
  encryptionKey?: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

/**
 *
 * @deprecated `buildSecretBlindIndexFromName` is no longer used for newer projects. It remains a relic from V1 secrets which is still supported on very old projects.
 */
export const buildSecretBlindIndexFromName = async ({
  secretName,
  ciphertext,
  keyEncoding,
  iv,
  tag,
  encryptionKey,
  rootEncryptionKey
}: TBuildSecretBlindIndexDTO) => {
  if (!encryptionKey && !rootEncryptionKey) throw new Error("Missing secret blind index key");
  let salt = "";
  if (rootEncryptionKey && keyEncoding === SecretKeyEncoding.BASE64) {
    salt = crypto
      .encryption()
      .symmetric()
      .decrypt({ iv, ciphertext, key: rootEncryptionKey, tag, keySize: SymmetricKeySize.Bits256 });
  } else if (encryptionKey && keyEncoding === SecretKeyEncoding.UTF8) {
    salt = crypto
      .encryption()
      .symmetric()
      .decrypt({ iv, ciphertext, key: encryptionKey, tag, keySize: SymmetricKeySize.Bits128 });
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
