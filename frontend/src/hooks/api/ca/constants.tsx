import { CertificateAuthorityType } from "./enums";

export const caTypeToNameMap: { [K in CertificateAuthorityType]: string } = {
  [CertificateAuthorityType.ROOT]: "Root",
  [CertificateAuthorityType.INTERMEDIATE]: "Intermediate"
};
