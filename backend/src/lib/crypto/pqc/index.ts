import * as x509 from "@peculiar/x509";

import { registerPqcAlgorithms } from "./pqc-algorithm";
import { createPqcCrypto, isPqcCryptoKey } from "./pqc-crypto";
import { verifyPqcOpenSSLAvailability } from "./pqc-openssl";

export { derivePublicKeyFromSecret, isPqcCryptoKey, PqcCryptoKey } from "./pqc-crypto";
export { isPqcAlgorithm } from "./pqc-utils";

let pqcCryptoInstance: Crypto | null = null;

export const initializePqcSupport = async () => {
  const available = await verifyPqcOpenSSLAvailability();
  if (!available) {
    return;
  }

  registerPqcAlgorithms();
  pqcCryptoInstance = createPqcCrypto();
  x509.cryptoProvider.set(pqcCryptoInstance);
};

export const getPqcCrypto = (): Crypto => {
  if (!pqcCryptoInstance) {
    return globalThis.crypto;
  }
  return pqcCryptoInstance;
};

export const exportPqcKeyToPem = async (key: CryptoKey): Promise<string> => {
  if (!isPqcCryptoKey(key)) {
    throw new Error("exportPqcKeyToPem: not a PQC key");
  }

  const pqcCrypto = getPqcCrypto();
  const format = key.type === "private" ? "pkcs8" : "spki";
  const der = await pqcCrypto.subtle.exportKey(format, key);
  const b64 = Buffer.from(der).toString("base64");

  const lines = b64.match(/.{1,64}/g) || [];
  const header = key.type === "private" ? "-----BEGIN PRIVATE KEY-----" : "-----BEGIN PUBLIC KEY-----";
  const footer = key.type === "private" ? "-----END PRIVATE KEY-----" : "-----END PUBLIC KEY-----";
  return `${header}\n${lines.join("\n")}\n${footer}`;
};

export const exportPqcKeyToDer = async (key: CryptoKey): Promise<Buffer> => {
  if (!isPqcCryptoKey(key)) {
    throw new Error("exportPqcKeyToDer: not a PQC key");
  }

  const pqcCrypto = getPqcCrypto();
  const format = key.type === "private" ? "pkcs8" : "spki";
  const der = await pqcCrypto.subtle.exportKey(format, key);
  return Buffer.from(der);
};
