import { crypto } from "@app/lib/crypto/cryptography";
import { rsaVerify as rsaVerifyGeneric } from "@app/lib/crypto/rsa";
import { BadRequestError } from "@app/lib/errors";

import { CIPHER_OID_MAP, DIGEST_OID_TO_HASH } from "./pki-scep-types";

export { rsaPkcs1Decrypt, rsaPkcs1Encrypt, rsaSign } from "@app/lib/crypto/rsa";

const { nativeCrypto, randomBytes } = crypto;

export const symmetricDecrypt = (encryptedContent: Buffer, key: Buffer, iv: Buffer, cipherOid: string): Buffer => {
  const cipherInfo = CIPHER_OID_MAP[cipherOid];
  if (!cipherInfo) {
    throw new BadRequestError({ message: `Unsupported cipher OID: ${cipherOid}` });
  }

  const decipher = nativeCrypto.createDecipheriv(cipherInfo.algorithm, key, iv);
  return Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
};

export const symmetricEncryptWithOid = (
  content: Buffer,
  cipherOid?: string
): { encryptedContent: Buffer; key: Buffer; iv: Buffer; cipherOid: string } => {
  const resolvedOid = cipherOid && CIPHER_OID_MAP[cipherOid] ? cipherOid : "2.16.840.1.101.3.4.1.42"; // default AES-256-CBC
  const cipherInfo = CIPHER_OID_MAP[resolvedOid];

  const key = randomBytes(cipherInfo.keyLength);
  const iv = randomBytes(cipherInfo.ivLength);

  const cipher = nativeCrypto.createCipheriv(cipherInfo.algorithm, key, iv);
  const encryptedContent = Buffer.concat([cipher.update(content), cipher.final()]);

  return { encryptedContent, key, iv, cipherOid: resolvedOid };
};

// SCEP-specific wrapper: resolves digest algorithm OID to hash name before calling the generic rsaVerify
export const rsaVerify = (
  data: Buffer,
  signature: Buffer,
  certificateDer: Buffer,
  digestAlgorithmOid: string
): boolean => {
  const hashName = DIGEST_OID_TO_HASH[digestAlgorithmOid];
  if (!hashName) {
    throw new BadRequestError({ message: `Unsupported digest algorithm OID for verification: ${digestAlgorithmOid}` });
  }

  return rsaVerifyGeneric(data, signature, certificateDer, hashName);
};
