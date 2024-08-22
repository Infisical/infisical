import * as x509 from "@peculiar/x509";

import { CrlReason } from "./certificate-types";

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

export const convertCertPemToRaw = (certPem: string) => {
  return new x509.X509Certificate(certPem).rawData;
};

export const checkCertValidityAgainstChain = async (cert: x509.X509Certificate, chainCerts: x509.X509Certificate[]) => {
  let isSslClientCertValid = true;
  let certToVerify = cert;

  for await (const issuerCert of chainCerts) {
    if (
      await certToVerify.verify({
        publicKey: issuerCert.publicKey
      })
    ) {
      certToVerify = issuerCert; // Move to the next certificate in the chain
    } else {
      isSslClientCertValid = false;
    }
  }

  return isSslClientCertValid;
};
