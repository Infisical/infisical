import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { CrlReason, TBuildCertificateChainDTO, TGetCertificateCredentialsDTO } from "./certificate-types";

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
    const skObj = crypto.createPrivateKey({ key: decryptedPrivateKey, format: "pem", type: "pkcs8" });
    const certPrivateKey = skObj.export({ format: "pem", type: "pkcs8" }).toString();

    const pkObj = crypto.createPublicKey(skObj);
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

// If the certificate was generated after ~05/01/25 it will have a encryptedCertificateChain attached to it's body
// Otherwise we'll fallback to manually building the chain
export const buildCertificateChain = async ({
  caCert,
  caCertChain,
  encryptedCertificateChain,
  kmsService,
  kmsId
}: TBuildCertificateChainDTO) => {
  if (!encryptedCertificateChain && (!caCert || !caCertChain)) {
    return null;
  }

  let certificateChain = `${caCert}\n${caCertChain}`.trim();

  if (encryptedCertificateChain) {
    const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId });
    const decryptedCertChain = await kmsDecryptor({
      cipherTextBlob: encryptedCertificateChain
    });
    certificateChain = decryptedCertChain.toString();
  }

  return certificateChain;
};
