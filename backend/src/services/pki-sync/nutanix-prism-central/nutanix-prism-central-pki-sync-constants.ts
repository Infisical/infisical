import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

export const NUTANIX_PRISM_CENTRAL_PKI_SYNC_LIST_OPTION = {
  name: "Nutanix Prism Central" as const,
  connection: AppConnection.NutanixPrismCentral,
  destination: PkiSync.NutanixPrismCentral,
  canImportCertificates: false,
  canRemoveCertificates: false,
  maxCertificates: 1
} as const;
