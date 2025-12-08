import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

export const CHEF_PKI_SYNC_LIST_OPTION = {
  name: "Chef" as const,
  connection: AppConnection.Chef,
  destination: PkiSync.Chef,
  canImportCertificates: false,
  canRemoveCertificates: true
} as const;
