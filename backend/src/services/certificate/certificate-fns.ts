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
