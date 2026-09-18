import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";

import { PkiDocsUrls } from "../../../pki-docs-urls";

export const HSM_SUPPORTED_CA_KEY_ALGORITHMS: readonly CertKeyAlgorithm[] = [
  CertKeyAlgorithm.RSA_2048,
  CertKeyAlgorithm.RSA_4096,
  CertKeyAlgorithm.ECDSA_P256,
  CertKeyAlgorithm.ECDSA_P384
];

export type HsmConnectorOption = { id: string; name: string; slotLabel: string };

export type WizardStep = {
  name: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
  docsUrl: string;
};

export const STEPS: WizardStep[] = [
  {
    name: "Basics",
    shortDescription: "Name and type",
    title: "Basics",
    subtitle: "Name the certificate authority and choose whether it is a root or intermediate.",
    rightLabel: "BASICS",
    rightDescription:
      "The name identifies the CA inside Infisical. A Root CA is self-signed and active immediately. An Intermediate CA is created pending a certificate, then signed by a parent CA after you generate its CSR.",
    docsUrl: PkiDocsUrls.ca.internal
  },
  {
    name: "Subject",
    shortDescription: "Distinguished name",
    title: "Subject",
    subtitle: "The distinguished name (DN) embedded in the CA certificate.",
    rightLabel: "SUBJECT",
    rightDescription:
      "The Common Name, Organization, and related fields make up the Distinguished Name that identifies this CA on every certificate it issues. At least one field is required.",
    docsUrl: PkiDocsUrls.ca.internal
  },
  {
    name: "Key & Validity",
    shortDescription: "Source, algorithm, validity",
    title: "Key & Validity",
    subtitle: "Choose where the signing key is generated and how long the CA is valid.",
    rightLabel: "KEY & VALIDITY",
    rightDescription:
      "Pick the key source: Infisical generates and manages the keypair, or HSM keeps the keypair inside your own Hardware Security Module and performs every signature there. Root CAs are self-signed immediately, so their validity and path length are set here.",
    docsUrl: PkiDocsUrls.ca.internal
  },
  {
    name: "Distribution",
    shortDescription: "Revocation endpoints",
    title: "Distribution",
    subtitle: "Configure the CRL distribution points embedded in issued certificates.",
    rightLabel: "DISTRIBUTION",
    rightDescription:
      "Certificates issued by this CA carry CRL Distribution Point URLs so clients can check revocation. The Infisical-managed CRL endpoint is included by default; add backup URLs or disable the managed one as needed.",
    docsUrl: PkiDocsUrls.ca.internal
  }
];
