import * as x509 from "@peculiar/x509";
import forge from "node-forge";
import RE2 from "re2";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { parseDistinguishedName } from "../certificate-authority/certificate-authority-fns";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import {
  CrlReason,
  TCertificateFingerprints,
  TCertificateSubject,
  TGetCertificateCredentialsDTO,
  TParsedCertificateBody
} from "./certificate-types";

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

  try {
    const skObj = crypto.nativeCrypto.createPrivateKey({ key: decryptedPrivateKey, format: "pem", type: "pkcs8" });
    const certPrivateKey = skObj.export({ format: "pem", type: "pkcs8" }).toString();

    const pkObj = crypto.nativeCrypto.createPublicKey(skObj);
    const certPublicKey = pkObj.export({ format: "pem", type: "spki" }).toString();

    return {
      certificateSecret,
      certPrivateKey,
      certPublicKey
    };
  } catch (error) {
    throw new BadRequestError({ message: `Failed to process private key for certificate with ID '${certId}'` });
  }
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
    throw new BadRequestError({
      message: `Failed to generate PKCS12 keystore: ${error instanceof Error ? error.message : "Unknown error"}`
    });
  }
};

/**
 * Parse and extract subject, fingerprints, and basicConstraints from a decrypted certificate.
 * Returns empty object on failure (graceful degradation).
 */
export const parseCertificateBody = (decryptedCertificate: Buffer): TParsedCertificateBody => {
  try {
    const certObj = new x509.X509Certificate(decryptedCertificate);

    // Parse subject DN to extract attributes
    const parsedDn = parseDistinguishedName(certObj.subject);
    const subject: TCertificateSubject = {
      commonName: parsedDn.commonName,
      organization: parsedDn.organization,
      organizationalUnit: parsedDn.ou,
      country: parsedDn.country,
      state: parsedDn.province,
      locality: parsedDn.locality
    };

    // Calculate fingerprints and format with colons (e.g., "1A:2F:73:...")
    const rawData = Buffer.from(certObj.rawData);
    const formatFingerprint = (hash: string) =>
      new RE2(".{2}", "g").match(hash.toUpperCase())?.join(":") ?? hash.toUpperCase();
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

    return { subject, fingerprints, basicConstraints };
  } catch {
    // If we can't parse the certificate, return empty object (graceful degradation)
    return {};
  }
};
