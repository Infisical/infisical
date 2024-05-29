import { CertStatus } from "./enums";

export const certStatusToNameMap: { [K in CertStatus]: string } = {
  [CertStatus.ACTIVE]: "Active",
  [CertStatus.REVOKED]: "Revoked"
};
