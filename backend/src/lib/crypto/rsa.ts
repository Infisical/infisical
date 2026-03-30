import forge from "node-forge";

import { crypto } from "./cryptography";

const { nativeCrypto } = crypto;

/**
 * RSA PKCS#1 v1.5 decryption using node-forge.
 *
 * Node.js native crypto removed RSA_PKCS1_PADDING for privateDecrypt (CVE-2023-46809).
 * Protocols that mandate PKCS#1 v1.5 key transport (e.g. SCEP per RFC 8894) need forge.
 */
export const rsaPkcs1Decrypt = (encryptedKey: Buffer, privateKeyDer: Buffer): Buffer => {
  const privateKeyPem = nativeCrypto
    .createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" })
    .export({ type: "pkcs8", format: "pem" }) as string;

  const forgePrivateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const decrypted = forgePrivateKey.decrypt(forge.util.createBuffer(encryptedKey).getBytes(), "RSAES-PKCS1-V1_5");

  return Buffer.from(decrypted, "binary");
};

/**
 * RSA PKCS#1 v1.5 encryption using node-forge.
 * Counterpart to rsaPkcs1Decrypt — uses forge for consistency.
 */
export const rsaPkcs1Encrypt = (key: Buffer, recipientPublicKeyDer: Buffer): Buffer => {
  const publicKeyPem = nativeCrypto
    .createPublicKey({ key: recipientPublicKeyDer, format: "der", type: "spki" })
    .export({ type: "spki", format: "pem" }) as string;

  const forgePublicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const encrypted = forgePublicKey.encrypt(forge.util.createBuffer(key).getBytes(), "RSAES-PKCS1-V1_5");

  return Buffer.from(encrypted, "binary");
};

/**
 * RSA-SHA256 signing with a DER-encoded PKCS#8 private key.
 */
export const rsaSign = (data: Buffer, privateKeyDer: Buffer): Buffer => {
  const privateKey = nativeCrypto.createPrivateKey({
    key: privateKeyDer,
    format: "der",
    type: "pkcs8"
  });

  const signer = nativeCrypto.createSign("RSA-SHA256");
  signer.update(data);
  return signer.sign(privateKey);
};

/**
 * RSA signature verification with a DER-encoded certificate and configurable digest.
 */
export const rsaVerify = (
  data: Buffer,
  signature: Buffer,
  certificateDer: Buffer,
  digestAlgorithm: string
): boolean => {
  const algo = `RSA-${digestAlgorithm.toUpperCase()}`;

  const cert = new nativeCrypto.X509Certificate(certificateDer);
  const verifier = nativeCrypto.createVerify(algo);
  verifier.update(data);
  return verifier.verify(cert.publicKey, signature);
};
