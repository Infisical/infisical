import { SshCaStatus } from "../sshCa";
import { SshCertTemplateStatus } from "../sshCertificateTemplates";
import { CaStatus, CaType } from "./enums";

export const caTypeToNameMap: { [K in CaType]: string } = {
  [CaType.ROOT]: "Root",
  [CaType.INTERMEDIATE]: "Intermediate"
};

export const caStatusToNameMap: { [K in CaStatus]: string } = {
  [CaStatus.ACTIVE]: "Active",
  [CaStatus.DISABLED]: "Disabled",
  [CaStatus.PENDING_CERTIFICATE]: "Pending Certificate"
};

export const getCaStatusBadgeVariant = (status: CaStatus | SshCaStatus | SshCertTemplateStatus) => {
  switch (status) {
    case CaStatus.ACTIVE:
      return "success";
    case CaStatus.DISABLED:
      return "danger";
    default:
      return "primary";
  }
};
