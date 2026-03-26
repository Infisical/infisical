import nodeCrypto from "node:crypto";

import forge from "node-forge";

import { BadRequestError } from "@app/lib/errors";

import { CIPHER_OID_MAP } from "./pki-scep-types";

// Node.js native crypto removed RSA_PKCS1_PADDING for privateDecrypt (CVE-2023-46809).
// SCEP mandates PKCS#1 v1.5 key transport per RFC 8894, so we use node-forge.
export const rsaPkcs1Decrypt = (encryptedKey: Buffer, privateKeyDer: Buffer): Buffer => {
  const privateKeyPem = nodeCrypto
    .createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" })
    .export({ type: "pkcs8", format: "pem" }) as string;

  const forgePrivateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const decrypted = forgePrivateKey.decrypt(forge.util.createBuffer(encryptedKey).getBytes(), "RSAES-PKCS1-V1_5");

  return Buffer.from(decrypted, "binary");
};

export const symmetricDecrypt = (encryptedContent: Buffer, key: Buffer, iv: Buffer, cipherOid: string): Buffer => {
  const cipherInfo = CIPHER_OID_MAP[cipherOid];
  if (!cipherInfo) {
    throw new BadRequestError({ message: `Unsupported cipher OID: ${cipherOid}` });
  }

  const decipher = nodeCrypto.createDecipheriv(cipherInfo.algorithm, key, iv);
  return Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
};

export const symmetricEncryptWithOid = (
  content: Buffer,
  cipherOid?: string
): { encryptedContent: Buffer; key: Buffer; iv: Buffer; cipherOid: string } => {
  const resolvedOid = cipherOid && CIPHER_OID_MAP[cipherOid] ? cipherOid : "2.16.840.1.101.3.4.1.42"; // default AES-256-CBC
  const cipherInfo = CIPHER_OID_MAP[resolvedOid];

  const key = nodeCrypto.randomBytes(cipherInfo.keyLength);
  const iv = nodeCrypto.randomBytes(cipherInfo.ivLength);

  const cipher = nodeCrypto.createCipheriv(cipherInfo.algorithm, key, iv);
  const encryptedContent = Buffer.concat([cipher.update(content), cipher.final()]);

  return { encryptedContent, key, iv, cipherOid: resolvedOid };
};

export const rsaPkcs1Encrypt = (key: Buffer, recipientPublicKeyDer: Buffer): Buffer => {
  const publicKey = nodeCrypto.createPublicKey({
    key: recipientPublicKeyDer,
    format: "der",
    type: "spki"
  });

  return nodeCrypto.publicEncrypt(
    {
      key: publicKey,
      padding: nodeCrypto.constants.RSA_PKCS1_PADDING
    },
    key
  );
};

export const rsaSign = (data: Buffer, privateKeyDer: Buffer): Buffer => {
  const privateKey = nodeCrypto.createPrivateKey({
    key: privateKeyDer,
    format: "der",
    type: "pkcs8"
  });

  const signer = nodeCrypto.createSign("RSA-SHA256");
  signer.update(data);
  return signer.sign(privateKey);
};

const DIGEST_OID_TO_ALGO: Record<string, string> = {
  "2.16.840.1.101.3.4.2.1": "RSA-SHA256",
  "1.3.14.3.2.26": "RSA-SHA1",
  "2.16.840.1.101.3.4.2.2": "RSA-SHA384",
  "2.16.840.1.101.3.4.2.3": "RSA-SHA512"
};

export const rsaVerify = (
  data: Buffer,
  signature: Buffer,
  certificateDer: Buffer,
  digestAlgorithmOid?: string
): boolean => {
  const cert = new nodeCrypto.X509Certificate(certificateDer);
  const { publicKey } = cert;

  // If the digest algorithm OID is known from SignerInfo, use it directly
  if (digestAlgorithmOid) {
    const algo = DIGEST_OID_TO_ALGO[digestAlgorithmOid];
    if (algo) {
      const verifier = nodeCrypto.createVerify(algo);
      verifier.update(data);
      return verifier.verify(publicKey, signature);
    }
  }

  // Fallback: try all supported algorithms
  const algorithms = ["RSA-SHA256", "RSA-SHA1", "RSA-SHA384", "RSA-SHA512"];
  for (const algo of algorithms) {
    try {
      const verifier = nodeCrypto.createVerify(algo);
      verifier.update(data);
      if (verifier.verify(publicKey, signature)) {
        return true;
      }
    } catch {
      // Algorithm not supported or key incompatible — try next
    }
  }

  return false;
};
