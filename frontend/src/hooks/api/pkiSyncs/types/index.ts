import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TAwsCertificateManagerPkiSync } from "./aws-certificate-manager-sync";
import { TAzureKeyVaultPkiSync } from "./azure-key-vault-sync";

export type TPkiSyncOption = {
  name: string;
  destination: PkiSync;
  canImportCertificates: boolean;
  canRemoveCertificates: boolean;
  enterprise?: boolean;
  defaultCertificateNameSchema?: string;
  forbiddenCharacters?: string;
  allowedCharacterPattern?: string;
  maxCertificateNameLength?: number;
  minCertificateNameLength?: number;
};

export type TPkiSync = TAzureKeyVaultPkiSync | TAwsCertificateManagerPkiSync;

export type TListPkiSyncs = { pkiSyncs: TPkiSync[] };

export type TListPkiSyncOptions = { pkiSyncOptions: TPkiSyncOption[] };

type TCreatePkiSyncDTOBase = {
  name: string;
  description?: string;
  connectionId: string;
  syncOptions: {
    canImportCertificates: boolean;
    canRemoveCertificates: boolean;
    certificateNamePrefix?: string;
    certificateNameSchema?: string;
  };
  isAutoSyncEnabled: boolean;
  subscriberId?: string | null;
  certificateIds?: string[];
  projectId: string;
};

export type TCreatePkiSyncDTO = TCreatePkiSyncDTOBase & {
  destination: PkiSync;
  destinationConfig: {
    vaultBaseUrl?: string;
    region?: string;
  };
};

export type TUpdatePkiSyncDTO = Partial<Omit<TCreatePkiSyncDTO, "projectId">> & {
  syncId: string;
  projectId: string;
};

export type TDeletePkiSyncDTO = {
  syncId: string;
  projectId: string;
  destination: PkiSync;
};

export type TTriggerPkiSyncSyncCertificatesDTO = {
  syncId: string;
  destination: PkiSync;
  projectId: string;
};

export type TTriggerPkiSyncImportCertificatesDTO = {
  syncId: string;
  destination: PkiSync;
  projectId: string;
};

export type TTriggerPkiSyncRemoveCertificatesDTO = {
  syncId: string;
  destination: PkiSync;
  projectId: string;
};

export * from "./aws-certificate-manager-sync";
export * from "./azure-key-vault-sync";
export * from "./common";
