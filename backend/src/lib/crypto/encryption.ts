import argon2 from "argon2";

import { SecretKeyEncoding } from "@app/db/schemas";

import { crypto, SymmetricKeySize } from "./cryptography";
import { getLegacyDecryptionCandidates } from "./legacy-key";

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
  // Snapshot over the passed-in env keys: after a rotation the environment holds the new key while
  // this salt is still under the old one.
  const candidates = getLegacyDecryptionCandidates();
  if (!candidates.length) candidates.push({ ENCRYPTION_KEY: encryptionKey, ROOT_ENCRYPTION_KEY: rootEncryptionKey });

  if (!candidates.some((candidate) => candidate.ENCRYPTION_KEY || candidate.ROOT_ENCRYPTION_KEY)) {
    throw new Error("Missing secret blind index key");
  }

  let salt = "";
  for (const candidate of candidates) {
    try {
      if (candidate.ROOT_ENCRYPTION_KEY && keyEncoding === SecretKeyEncoding.BASE64) {
        salt = crypto
          .encryption()
          .symmetric()
          .decrypt({ iv, ciphertext, key: candidate.ROOT_ENCRYPTION_KEY, tag, keySize: SymmetricKeySize.Bits256 });
      } else if (candidate.ENCRYPTION_KEY && keyEncoding === SecretKeyEncoding.UTF8) {
        salt = crypto
          .encryption()
          .symmetric()
          .decrypt({ iv, ciphertext, key: candidate.ENCRYPTION_KEY, tag, keySize: SymmetricKeySize.Bits128 });
      }
    } catch {
      salt = "";
    }
    if (salt) break;
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
