/* eslint-disable no-nested-ternary */
import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { CertKeyAlgorithm, CertStatus } from "../certificate/certificate-types";
import { DEFAULT_CRL_VALIDITY_DAYS } from "../certificate-common/certificate-constants";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import {
  TDNParts,
  TGetCaCertChainDTO,
  TGetCaCertChainsDTO,
  TGetCaCredentialsDTO,
  TRebuildCaCrlDTO
} from "./internal/internal-certificate-authority-types";

/* eslint-disable no-bitwise */
export const createSerialNumber = () => {
  const randomBytes = crypto.randomBytes(20); // 20 bytes = 160 bits
  randomBytes[0] &= 0x7f; // ensure the first bit is 0
  return randomBytes.toString("hex");
};

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

export const parseDistinguishedName = (dn: string): TDNParts => {
  const parts: TDNParts = {};
  const dnParts = dn.split(/,\s*/);

  for (const part of dnParts) {
    const [key, value] = part.split("=");
    switch (key.toUpperCase()) {
      case "C":
        parts.country = value;
        break;
      case "O":
        parts.organization = value;
        break;
      case "OU":
        parts.ou = value;
        break;
      case "ST":
        parts.province = value;
        break;
      case "CN":
        parts.commonName = value;
        break;
      case "L":
        parts.locality = value;
        break;
      default:
        // Ignore unrecognized keys
        break;
    }
  }

  return parts;
};

export const keyAlgorithmToAlgCfg = (keyAlgorithm: CertKeyAlgorithm) => {
  switch (keyAlgorithm) {
    case CertKeyAlgorithm.RSA_3072:
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 3072
      };
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

export const signatureAlgorithmToAlgCfg = (signatureAlgorithm: string, keyAlgorithm: CertKeyAlgorithm | string) => {
  // Parse signature algorithm like "RSA-SHA256", "ECDSA-SHA256" etc.
  if (!signatureAlgorithm || typeof signatureAlgorithm !== "string" || !signatureAlgorithm.includes("-")) {
    throw new Error(`Invalid signature algorithm format: ${signatureAlgorithm}`);
  }

  const [keyType, hashType] = signatureAlgorithm.split("-");

  if (!keyType || !hashType) {
    throw new Error(`Malformed signature algorithm: ${signatureAlgorithm}`);
  }

  const normalizeHashType = (hash: string) => {
    const upperHash = hash.toUpperCase();

    if (upperHash === "SHA1" || upperHash === "SHA-1") return "SHA-1";

    if (upperHash === "SHA224" || upperHash === "SHA-224") return "SHA-224";
    if (upperHash === "SHA256" || upperHash === "SHA-256") return "SHA-256";
    if (upperHash === "SHA384" || upperHash === "SHA-384") return "SHA-384";
    if (upperHash === "SHA512" || upperHash === "SHA-512") return "SHA-512";

    if (upperHash === "SHA3224" || upperHash === "SHA3-224") return "SHA3-224";
    if (upperHash === "SHA3256" || upperHash === "SHA3-256") return "SHA3-256";
    if (upperHash === "SHA3384" || upperHash === "SHA3-384") return "SHA3-384";
    if (upperHash === "SHA3512" || upperHash === "SHA3-512") return "SHA3-512";

    throw new Error(`Unsupported hash algorithm: ${hash}`);
  };

  const normalizedHash = hashType ? normalizeHashType(hashType) : undefined;

  switch (keyType) {
    case "RSA":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: normalizedHash || "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength:
          keyAlgorithm === CertKeyAlgorithm.RSA_4096 ? 4096 : keyAlgorithm === CertKeyAlgorithm.RSA_3072 ? 3072 : 2048
      };
    case "ECDSA":
      // eslint-disable-next-line no-case-declarations
      const is384Curve =
        keyAlgorithm === CertKeyAlgorithm.ECDSA_P384 || keyAlgorithm === "EC_secp384r1" || keyAlgorithm === "EC_P384";
      // eslint-disable-next-line no-case-declarations
      const is521Curve = keyAlgorithm === "EC_secp521r1" || keyAlgorithm === "EC_P521";
      // eslint-disable-next-line no-case-declarations
      let namedCurve: string;
      if (is521Curve) {
        namedCurve = "P-521";
      } else if (is384Curve) {
        namedCurve = "P-384";
      } else {
        namedCurve = "P-256";
      }
      return {
        name: "ECDSA",
        namedCurve,
        hash: normalizedHash || (namedCurve === "P-384" ? "SHA-384" : "SHA-256")
      };
    default:
      // Fallback to key algorithm default
      return keyAlgorithmToAlgCfg(keyAlgorithm as CertKeyAlgorithm);
  }
};

/**
 * Return the public and private key of CA with id [caId]
 * Note: credentials are returned as crypto.webcrypto.CryptoKey
 * suitable for use with @peculiar/x509 module
 *
 * TODO: Update to get latest CA Secret once support for CA renewal with new key pair is added
 */
export const getCaCredentials = async ({
  caId,
  certificateAuthorityDAL,
  certificateAuthoritySecretDAL,
  projectDAL,
  kmsService,
  signatureAlgorithm
}: TGetCaCredentialsDTO) => {
  const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
  if (!ca?.internalCa?.id) throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });

  const caSecret = await certificateAuthoritySecretDAL.findOne({ caId });
  if (!caSecret) throw new NotFoundError({ message: `CA secret for CA with ID '${caId}' not found` });

  const keyId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });
  const decryptedPrivateKey = await kmsDecryptor({
    cipherTextBlob: caSecret.encryptedPrivateKey
  });

  const alg = signatureAlgorithm || keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);
  const skObj = crypto.nativeCrypto.createPrivateKey({ key: decryptedPrivateKey, format: "der", type: "pkcs8" });
  const caPrivateKey = await crypto.nativeCrypto.subtle.importKey(
    "pkcs8",
    skObj.export({ format: "der", type: "pkcs8" }),
    alg,
    true,
    ["sign"]
  );

  const pkObj = crypto.nativeCrypto.createPublicKey(skObj);
  const caPublicKey = await crypto.nativeCrypto.subtle.importKey(
    "spki",
    pkObj.export({ format: "der", type: "spki" }),
    alg,
    true,
    ["verify"]
  );

  return {
    caSecret,
    caPrivateKey,
    caPublicKey
  };
};

/**
 * Return the list of decrypted pem-encoded certificates and certificate chains
 * for CA with id [caId].
 */
export const getCaCertChains = async ({
  caId,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  projectDAL,
  kmsService
}: TGetCaCertChainsDTO) => {
  const ca = await certificateAuthorityDAL.findById(caId);
  if (!ca) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });

  const keyId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });

  const caCerts = await certificateAuthorityCertDAL.find({ caId: ca.id }, { sort: [["version", "asc"]] });

  const decryptedChains = await Promise.all(
    caCerts.map(async (caCert) => {
      const decryptedCaCert = await kmsDecryptor({
        cipherTextBlob: caCert.encryptedCertificate
      });
      const caCertObj = new x509.X509Certificate(decryptedCaCert);
      const decryptedChain = await kmsDecryptor({
        cipherTextBlob: caCert.encryptedCertificateChain
      });
      return {
        certificate: caCertObj.toString("pem"),
        certificateChain: decryptedChain.toString("utf-8"),
        serialNumber: caCertObj.serialNumber,
        version: caCert.version
      };
    })
  );

  return decryptedChains;
};

/**
 * Return the decrypted pem-encoded certificate and certificate chain
 * corresponding to CA certificate with id [caCertId].
 */
export const getCaCertChain = async ({
  caCertId,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  projectDAL,
  kmsService
}: TGetCaCertChainDTO) => {
  const caCert = await certificateAuthorityCertDAL.findById(caCertId);
  if (!caCert) throw new NotFoundError({ message: "CA certificate not found" });
  const ca = await certificateAuthorityDAL.findById(caCert.caId);

  const keyId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });

  const decryptedCaCert = await kmsDecryptor({
    cipherTextBlob: caCert.encryptedCertificate
  });

  const caCertObj = new x509.X509Certificate(decryptedCaCert);

  const decryptedChain = await kmsDecryptor({
    cipherTextBlob: caCert.encryptedCertificateChain
  });

  return {
    caCert: caCertObj.toString("pem"),
    caCertChain: decryptedChain.toString("utf-8"),
    serialNumber: caCertObj.serialNumber
  };
};

/**
 * Rebuilds the certificate revocation list (CRL)
 * for CA with id [caId]
 */
export const rebuildCaCrl = async ({
  caId,
  certificateAuthorityDAL,
  certificateAuthorityCrlDAL,
  certificateAuthoritySecretDAL,
  projectDAL,
  certificateDAL,
  kmsService
}: TRebuildCaCrlDTO) => {
  const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
  if (!ca?.internalCa?.id) throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });

  const caSecret = await certificateAuthoritySecretDAL.findOne({ caId: ca.id });

  const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

  const keyId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });

  const privateKey = await kmsDecryptor({
    cipherTextBlob: caSecret.encryptedPrivateKey
  });

  const skObj = crypto.nativeCrypto.createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
  const sk = await crypto.nativeCrypto.subtle.importKey(
    "pkcs8",
    skObj.export({ format: "der", type: "pkcs8" }),
    alg,
    true,
    ["sign"]
  );

  const revokedCerts = await certificateDAL.find({
    caId: ca.id,
    status: CertStatus.REVOKED
  });

  const thisUpdate = new Date();
  const nextUpdate = new Date(thisUpdate);
  nextUpdate.setDate(nextUpdate.getDate() + DEFAULT_CRL_VALIDITY_DAYS);

  const crl = await x509.X509CrlGenerator.create({
    issuer: ca.internalCa.dn,
    thisUpdate,
    nextUpdate,
    entries: revokedCerts.map((revokedCert) => {
      const revocationDate = new Date(revokedCert.revokedAt as Date);
      return {
        serialNumber: revokedCert.serialNumber,
        revocationDate,
        reason: revokedCert.revocationReason as number
      };
    }),
    signingAlgorithm: alg,
    signingKey: sk
  });

  const kmsEncryptor = await kmsService.encryptWithKmsKey({
    kmsId: keyId
  });
  const { cipherTextBlob: encryptedCrl } = await kmsEncryptor({
    plainText: Buffer.from(new Uint8Array(crl.rawData))
  });

  await certificateAuthorityCrlDAL.update(
    {
      caId: ca.id
    },
    {
      encryptedCrl
    }
  );
};

export const expandInternalCa = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
) => {
  if (!ca.internalCa) {
    throw new Error("Internal CA must be defined");
  }
  return {
    ...ca.internalCa,
    ...ca,
    requireTemplateForIssuance: !ca.enableDirectIssuance
  } as const;
};
