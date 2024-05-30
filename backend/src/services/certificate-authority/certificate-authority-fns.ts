import { CertKeyAlgorithm, TDNParts } from "./certificate-authority-types";

export const createDistinguishedName = (parts: TDNParts) => {
  const dnParts = [];
  if (parts.country) dnParts.push(`C=${parts.country}`);
  if (parts.organization) dnParts.push(`O=${parts.organization}`);
  if (parts.ou) dnParts.push(`OU=${parts.ou}`);
  if (parts.province) dnParts.push(`ST=${parts.province}`);
  if (parts.commonName) dnParts.push(`CN=${parts.commonName}`);
  if (parts.locality) dnParts.push(`L=${parts.locality}`);
  return dnParts.join(", ");
};

export const keyAlgorithmToAlgCfg = (keyAlgorithm: CertKeyAlgorithm) => {
  switch (keyAlgorithm) {
    case CertKeyAlgorithm.RSA_4096:
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 4096
      };
    case CertKeyAlgorithm.ECDSA_P256:
      return {
        name: "ECDSA",
        namedCurve: "P-256",
        hash: "SHA-256"
      };
    case CertKeyAlgorithm.ECDSA_P384:
      return {
        name: "ECDSA",
        namedCurve: "P-384",
        hash: "SHA-384"
      };
    default: {
      // RSA_2048
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048
      };
    }
  }
};
