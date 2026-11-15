import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

export enum ImpervaCertificateAuthType {
  Rsa = "RSA",
  Ecc = "ECC"
}

export const IMPERVA_PKI_SYNC_LIST_OPTION = {
  name: "Imperva" as const,
  connection: AppConnection.Imperva,
  destination: PkiSync.Imperva,
  canImportCertificates: false,
  canRemoveCertificates: true,
  canRunPostSyncCommand: false,
  canRunHealthCheckCommand: false,
  // Imperva holds a single custom certificate per site for each key type
  maxCertificates: 1
} as const;
