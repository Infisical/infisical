import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";

const RA_CERT_VALIDITY_YEARS = 10;

export const generateRaCertificate = async (
  slug: string
): Promise<{
  privateKeyDer: ArrayBuffer;
  certificatePem: string;
  expiresAt: Date;
}> => {
  x509.cryptoProvider.set(crypto.webcrypto as Crypto);

  const keyPair = await crypto.webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );

  const now = new Date();
  const notAfter = new Date(now);
  notAfter.setFullYear(notAfter.getFullYear() + RA_CERT_VALIDITY_YEARS);

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: crypto.randomBytes(16).toString("hex"),
    name: `CN=Infisical SCEP RA - ${slug}`,
    notBefore: now,
    notAfter,
    signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    keys: keyPair,
    extensions: [
      // eslint-disable-next-line no-bitwise
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
      new x509.BasicConstraintsExtension(false, undefined, true)
    ]
  });

  const privateKeyDer = await crypto.webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    privateKeyDer,
    certificatePem: cert.toString("pem"),
    expiresAt: notAfter
  };
};

export const getScepCapabilities = ({ allowCertBasedRenewal }: { allowCertBasedRenewal: boolean }): string => {
  const caps = ["POSTPKIOperation", "SHA-256", "SHA-1", "AES", "DES3", "SCEPStandard"];
  if (allowCertBasedRenewal) {
    caps.push("Renewal");
  }
  return caps.join("\n");
};
