import * as x509 from "@peculiar/x509";
import forge from "node-forge";
import RE2 from "re2";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { extractDnParts } from "../certificate-authority/certificate-authority-fns";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSignatureAlgorithm,
  CrlReason,
  TCertificateFingerprints,
  TCertificateSubject,
  TGetCertificateCredentialsDTO,
  TParsedCertificateBody
} from "./certificate-types";

export const keySizeToAlgorithms = (keySize: number): string[] => {
  const map: Record<number, string[]> = {
    2048: [CertKeyAlgorithm.RSA_2048],
    3072: [CertKeyAlgorithm.RSA_3072],
    4096: [CertKeyAlgorithm.RSA_4096],
    256: [CertKeyAlgorithm.ECDSA_P256],
    384: [CertKeyAlgorithm.ECDSA_P384],
    521: [CertKeyAlgorithm.ECDSA_P521]
  };
  return map[keySize] ?? [];
};

export const revocationReasonToCrlCode = (crlReason: CrlReason) => {
  switch (crlReason) {
    case CrlReason.KEY_COMPROMISE:
      return x509.X509CrlReason.keyCompromise;
    case CrlReason.CA_COMPROMISE:
      return x509.X509CrlReason.cACompromise;
    case CrlReason.AFFILIATION_CHANGED:
      return x509.X509CrlReason.affiliationChanged;
    case CrlReason.SUPERSEDED:
      return x509.X509CrlReason.superseded;
    case CrlReason.CESSATION_OF_OPERATION:
      return x509.X509CrlReason.cessationOfOperation;
    case CrlReason.CERTIFICATE_HOLD:
      return x509.X509CrlReason.certificateHold;
    case CrlReason.PRIVILEGE_WITHDRAWN:
      return x509.X509CrlReason.privilegeWithdrawn;
    case CrlReason.A_A_COMPROMISE:
      return x509.X509CrlReason.aACompromise;
    default:
      return x509.X509CrlReason.unspecified;
  }
};

export const isCertChainValid = async (certificates: x509.X509Certificate[]) => {
  if (certificates.length === 1) {
    return true;
  }

  const leafCert = certificates[0];
  const chain = new x509.X509ChainBuilder({
    certificates: certificates.slice(1)
  });

  const chainItems = await chain.build(leafCert);

  // chain.build() implicitly verifies the chain
  return chainItems.length === certificates.length;
};

export const constructPemChainFromCerts = (certificates: x509.X509Certificate[]) =>
  certificates
    .map((cert) => cert.toString("pem"))
    .join("\n")
    .trim();

export const prependCertToPemChain = (cert: x509.X509Certificate, pemChain: string) =>
  `${cert.toString("pem")}\n${pemChain}`;

// Concatenates a certificate, its chain, and its private key into a single PEM bundle. Used by sync
// destinations that upload the full certificate as one file.
export const buildCertificateBundle = (cert: string, privateKey: string, certificateChain?: string): string => {
  const parts = [cert.trim()];
  if (certificateChain) {
    parts.push(certificateChain.trim());
  }
  parts.push(privateKey.trim());
  return `${parts.join("\n")}\n`;
};

export const splitPemChain = (pemText: string) => {
  const re2Pattern = new RE2("-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----", "g");

  return re2Pattern.match(pemText) || [];
};

/**
 * Return the public and private key of certificate
 * Note: credentials are returned as PEM strings
 */
export const getCertificateCredentials = async ({
  certId,
  projectId,
  certificateSecretDAL,
  projectDAL,
  kmsService
}: TGetCertificateCredentialsDTO) => {
  const certificateSecret = await certificateSecretDAL.findOne({ certId });
  if (!certificateSecret)
    throw new NotFoundError({ message: `Certificate secret for certificate with ID '${certId}' not found` });

  const keyId = await getProjectKmsCertificateKeyId({
    projectId,
    projectDAL,
    kmsService
  });
  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });
  const decryptedPrivateKey = await kmsDecryptor({
    cipherTextBlob: certificateSecret.encryptedPrivateKey
  });

  const certPrivateKey = decryptedPrivateKey.toString("utf-8");

  let certPublicKey = "";
  try {
    const skObj = crypto.nativeCrypto.createPrivateKey({ key: decryptedPrivateKey, format: "pem", type: "pkcs8" });
    const pkObj = crypto.nativeCrypto.createPublicKey(skObj);
    certPublicKey = pkObj.export({ format: "pem", type: "spki" }).toString();
  } catch {
    // Key type not supported by the current OpenSSL version
  }

  return {
    certificateSecret,
    certPrivateKey,
    certPublicKey
  };
};

export const generatePkcs12FromCertificate = async ({
  certificate,
  certificateChain,
  privateKey,
  password,
  alias
}: {
  certificate: string;
  certificateChain: string;
  privateKey: string;
  password: string;
  alias: string;
}): Promise<Buffer> => {
  try {
    if (!password || password.trim() === "") {
      throw new BadRequestError({ message: "Password is required for PKCS12 keystore generation" });
    }

    // node-forge only builds keystores from RSA keys, and cannot read PQC keys at all
    let keyType: string | undefined;
    try {
      keyType = crypto.nativeCrypto.createPrivateKey({
        key: privateKey,
        format: "pem",
        type: "pkcs8"
      }).asymmetricKeyType;
    } catch {
      keyType = undefined;
    }

    if (keyType !== "rsa") {
      throw new BadRequestError({
        message: "PKCS#12 export is not supported for this key type. Use PEM format instead."
      });
    }

    const cert = forge.pki.certificateFromPem(certificate);
    const key = forge.pki.privateKeyFromPem(privateKey);

    const chainCerts = [];
    if (certificateChain) {
      const chainPems = splitPemChain(certificateChain);
      for (const chainPem of chainPems) {
        try {
          const chainCert = forge.pki.certificateFromPem(chainPem);
          chainCerts.push(chainCert);
        } catch (error) {
          // Skip invalid certificates in chain
        }
      }
    }

    // Generate PKCS12 file
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert, ...chainCerts], password, {
      algorithm: "aes256", // Modern AES-256 encryption
      friendlyName: alias
    });

    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

    return Buffer.from(p12Der, "binary");
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to generate PKCS12 keystore: ${error instanceof Error ? error.message : "Unknown error"}`
    });
  }
};

/**
 * Format a raw hex digest as an upper-cased, colon-delimited fingerprint (e.g., "1A:2F:73:...").
 */
export const formatFingerprint = (hash: string) =>
  new RE2(".{2}", "g").match(hash.toUpperCase())?.join(":") ?? hash.toUpperCase();

export enum CertificateThumbprintAlgorithm {
  SHA1 = "sha1",
  SHA256 = "sha256"
}

/**
 * Normalize a user-supplied certificate thumbprint into the colon-delimited fingerprint format
 * stored on the certificate (e.g., "1A:2F:..."). Accepts thumbprints with or without colons,
 * whitespace, or other separators, in any case. Returns the matching algorithm based on digest
 * length (40 hex chars => SHA-1, 64 hex chars => SHA-256).
 */
export const normalizeThumbprint = (thumbprint: string) => {
  const hex = thumbprint.replace(new RE2("[^a-fA-F0-9]", "g"), "");

  let algorithm: CertificateThumbprintAlgorithm;
  if (hex.length === 40) {
    algorithm = CertificateThumbprintAlgorithm.SHA1;
  } else if (hex.length === 64) {
    algorithm = CertificateThumbprintAlgorithm.SHA256;
  } else {
    throw new BadRequestError({
      message: "Invalid thumbprint. Expected a SHA-1 (40 hex characters) or SHA-256 (64 hex characters) digest"
    });
  }

  return { algorithm, fingerprint: formatFingerprint(hex) };
};

/**
 * Parse and extract subject, fingerprints, and basicConstraints from a decrypted certificate.
 * Returns empty object on failure (graceful degradation).
 */
export const parseCertificateBody = (decryptedCertificate: Buffer): TParsedCertificateBody => {
  try {
    const certObj = new x509.X509Certificate(decryptedCertificate);

    // Extract subject DN attributes directly from the x509 Name object
    const parsedDn = extractDnParts(certObj.subjectName);
    const subject: TCertificateSubject = {
      commonName: parsedDn.commonName,
      organization: parsedDn.organization,
      organizationalUnit: parsedDn.ou,
      country: parsedDn.country,
      state: parsedDn.province,
      locality: parsedDn.locality
    };
    if (parsedDn.domainComponents?.length) subject.domainComponents = parsedDn.domainComponents;

    // Calculate fingerprints and format with colons (e.g., "1A:2F:73:...")
    const rawData = Buffer.from(certObj.rawData);
    const fingerprints: TCertificateFingerprints = {
      sha256: formatFingerprint(crypto.nativeCrypto.createHash("sha256").update(rawData).digest("hex")),
      sha1: formatFingerprint(crypto.nativeCrypto.createHash("sha1").update(rawData).digest("hex"))
    };

    // Extract basicConstraints extension
    let basicConstraints: { isCA: boolean; pathLength?: number } | undefined;
    const basicConstraintsExt = certObj.getExtension(x509.BasicConstraintsExtension);
    if (basicConstraintsExt) {
      basicConstraints = {
        isCA: basicConstraintsExt.ca,
        pathLength: basicConstraintsExt.pathLength
      };
    }

    let keyUsages: CertKeyUsage[] | undefined;
    const keyUsagesExt = certObj.getExtension(x509.KeyUsagesExtension);
    if (keyUsagesExt) {
      keyUsages = Object.values(CertKeyUsage).filter(
        // eslint-disable-next-line no-bitwise
        (keyUsage) => (x509.KeyUsageFlags[keyUsage] & keyUsagesExt.usages) !== 0
      );
    }

    let extendedKeyUsages: CertExtendedKeyUsage[] | undefined;
    const extendedKeyUsagesExt = certObj.getExtension(x509.ExtendedKeyUsageExtension);
    if (extendedKeyUsagesExt) {
      extendedKeyUsages = extendedKeyUsagesExt.usages
        .map((oid) => CertExtendedKeyUsageOIDToName[oid as string])
        .filter(Boolean);
    }

    return { subject, fingerprints, basicConstraints, keyUsages, extendedKeyUsages };
  } catch {
    // If we can't parse the certificate, return empty object (graceful degradation)
    return {};
  }
};

const EC_CURVE_KEY_ALGORITHMS: Record<string, CertKeyAlgorithm> = {
  "P-256": CertKeyAlgorithm.ECDSA_P256,
  "P-384": CertKeyAlgorithm.ECDSA_P384,
  "P-521": CertKeyAlgorithm.ECDSA_P521
};

const RSA_KEY_ALGORITHMS: Record<number, CertKeyAlgorithm> = {
  2048: CertKeyAlgorithm.RSA_2048,
  3072: CertKeyAlgorithm.RSA_3072,
  4096: CertKeyAlgorithm.RSA_4096
};

const RSA_SIGNATURE_ALGORITHMS: Record<string, CertSignatureAlgorithm> = {
  "SHA-256": CertSignatureAlgorithm.RSA_SHA256,
  "SHA-384": CertSignatureAlgorithm.RSA_SHA384,
  "SHA-512": CertSignatureAlgorithm.RSA_SHA512
};

const ECDSA_SIGNATURE_ALGORITHMS: Record<string, CertSignatureAlgorithm> = {
  "SHA-256": CertSignatureAlgorithm.ECDSA_SHA256,
  "SHA-384": CertSignatureAlgorithm.ECDSA_SHA384,
  "SHA-512": CertSignatureAlgorithm.ECDSA_SHA512
};

// Import accepts certificates the issuance enums do not cover, such as Ed25519 and secp256k1, so an
// unrecognised algorithm is recorded under its own name rather than rejected. The UI falls back to
// the raw value when it is not one it has a label for.
export const extractCertificateAlgorithms = (decryptedCertificate: Buffer) => {
  let certObj: x509.X509Certificate;
  try {
    certObj = new x509.X509Certificate(decryptedCertificate);
  } catch {
    return {};
  }

  const publicKeyAlgorithm = certObj.publicKey.algorithm as {
    name: string;
    modulusLength?: number;
    namedCurve?: string;
  };
  const signature = certObj.signatureAlgorithm as unknown as { name: string; hash?: { name: string } };
  const hashName = signature.hash?.name ?? "";

  let keyAlgorithm: string = publicKeyAlgorithm.name;
  if (publicKeyAlgorithm.name.startsWith("RSA")) {
    const bits = publicKeyAlgorithm.modulusLength;
    keyAlgorithm = (bits && RSA_KEY_ALGORITHMS[bits]) || (bits ? `RSA_${bits}` : "RSA");
  } else if (publicKeyAlgorithm.name === "ECDSA") {
    const curve = publicKeyAlgorithm.namedCurve ?? "";
    keyAlgorithm = EC_CURVE_KEY_ALGORITHMS[curve] ?? (curve ? `EC_${curve}` : "EC");
  }

  let signatureAlgorithm: string = signature.name;
  if (signature.name.startsWith("RSA")) {
    signatureAlgorithm = RSA_SIGNATURE_ALGORITHMS[hashName] ?? `RSA-${hashName || "UNKNOWN"}`;
  } else if (signature.name === "ECDSA") {
    signatureAlgorithm = ECDSA_SIGNATURE_ALGORITHMS[hashName] ?? `ECDSA-${hashName || "UNKNOWN"}`;
  }

  return { keyAlgorithm, signatureAlgorithm };
};

/**
 * Extract certificate fields including subject attributes, fingerprints, and basic constraints.
 * Returns all parsed fields as separate properties.
 */
export const extractCertificateFields = (decryptedCertificate: Buffer) => {
  const parsed = parseCertificateBody(decryptedCertificate);

  return {
    // Subject attributes
    subjectOrganization: parsed.subject?.organization ?? null,
    subjectOrganizationalUnit: parsed.subject?.organizationalUnit ?? null,
    subjectCountry: parsed.subject?.country ?? null,
    subjectState: parsed.subject?.state ?? null,
    subjectLocality: parsed.subject?.locality ?? null,
    // DC labels contain no commas, so a comma-joined string round-trips cleanly.
    subjectDomainComponents: parsed.subject?.domainComponents?.length
      ? parsed.subject.domainComponents.join(",")
      : null,

    // Fingerprints
    fingerprintSha256: parsed.fingerprints?.sha256 ?? null,
    fingerprintSha1: parsed.fingerprints?.sha1 ?? null,

    // Basic constraints
    isCA: parsed.basicConstraints?.isCA ?? null,
    pathLength: parsed.basicConstraints?.pathLength ?? null,

    // Callers spread these last so the issued usages win over the requested ones. Absent when the
    // certificate carries no such extension, leaving the requested values in place.
    ...(parsed.keyUsages && { keyUsages: parsed.keyUsages }),
    ...(parsed.extendedKeyUsages && { extendedKeyUsages: parsed.extendedKeyUsages })
  };
};
