import { AppConnection } from "../appConnections/enums";
import { SshCaStatus } from "../sshCa";
import { SshCertTemplateStatus } from "../sshCertificateTemplates";
import { AcmeDnsProvider, CaStatus, InternalCaType } from "./enums";

export const caTypeToNameMap: { [K in InternalCaType]: string } = {
  [InternalCaType.ROOT]: "Root",
  [InternalCaType.INTERMEDIATE]: "Intermediate"
};

export const caStatusToNameMap: { [K in CaStatus]: string } = {
  [CaStatus.ACTIVE]: "Active",
  [CaStatus.DISABLED]: "Disabled",
  [CaStatus.PENDING_CERTIFICATE]: "Pending Certificate"
};

export const ACME_DNS_PROVIDER_NAME_MAP: Record<AcmeDnsProvider, string> = {
  [AcmeDnsProvider.ROUTE53]: "Route53",
  [AcmeDnsProvider.Cloudflare]: "Cloudflare"
};

export const ACME_DNS_PROVIDER_APP_CONNECTION_MAP: Record<AcmeDnsProvider, AppConnection> = {
  [AcmeDnsProvider.ROUTE53]: AppConnection.AWS,
  [AcmeDnsProvider.Cloudflare]: AppConnection.Cloudflare
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
