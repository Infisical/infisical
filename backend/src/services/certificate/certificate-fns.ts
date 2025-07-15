import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { CrlReason, TGetCertificateCredentialsDTO } from "./certificate-types";

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
