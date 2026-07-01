import { CaType } from "@app/hooks/api/ca/enums";

import { PkiDocsUrls } from "../../../pki-docs-urls";

export type CaGroup = "internal" | "external";
export type CaOption = {
  id: string;
  name: string;
  groupType: CaGroup;
  caType: CaType;
  digicert?: { appConnectionId: string; organizationId: number; productNameId: string };
};

export type StepConfig = {
  name: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
  docsUrl: string;
};

export const STEPS: StepConfig[] = [
  {
    name: "Basics",
    shortDescription: "Name and description",
    title: "Basics",
    subtitle: "A short name and what this signer is for.",
    rightLabel: "BASICS",
    rightDescription:
      "Update the signer's name and description so your team can recognize it. Changing these does not affect the certificate.",
    docsUrl: PkiDocsUrls.codeSigning.signers.editBasics
  },
  {
    name: "Certificate",
    shortDescription: "CA and identity",
    title: "Certificate",
    subtitle: "The certificate behind this signer.",
    rightLabel: "CERTIFICATE",
    rightDescription:
      "Choose which CA issues the certificate and review its name and validity. Swapping the CA reissues the certificate right away.",
    docsUrl: PkiDocsUrls.codeSigning.signers.editCertificate
  },
  {
    name: "Signing Key",
    shortDescription: "Key storage and algorithm",
    title: "Signing Key",
    subtitle: "Where the signing key lives and which algorithm to use.",
    rightLabel: "SIGNING KEY",
    rightDescription:
      "Changing the key source or algorithm reissues the certificate with a new key. Some CAs require an HSM-backed key.",
    docsUrl: PkiDocsUrls.codeSigning.signers.editCertificate
  }
];
