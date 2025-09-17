import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { DiscriminativePick } from "@app/types";

import { TAzureKeyVaultPkiSync } from "./azure-key-vault-sync";

export type TPkiSyncOption = {
  name: string;
  destination: PkiSync;
  canImportCertificates: boolean;
  canRemoveCertificates: boolean;
  enterprise?: boolean;
};

export type TPkiSync = TAzureKeyVaultPkiSync;

export type TListPkiSyncs = { pkiSyncs: TPkiSync[] };

export type TListPkiSyncOptions = { pkiSyncOptions: TPkiSyncOption[] };
export type TPkiSyncResponse = { pkiSync: TPkiSync };

export type TCreatePkiSyncDTO = DiscriminativePick<
  TPkiSync,
  | "name"
  | "destinationConfig"
  | "description"
  | "connectionId"
  | "syncOptions"
  | "destination"
  | "isAutoSyncEnabled"
> & { subscriberId?: string; projectId: string };

export type TUpdatePkiSyncDTO = Partial<Omit<TCreatePkiSyncDTO, "projectId">> & {
  syncId: string;
  projectId: string;
  destination: PkiSync;
};

export type TDeletePkiSyncDTO = {
  syncId: string;
  projectId: string;
  destination: PkiSync;
};

export type TTriggerPkiSyncSyncCertificatesDTO = {
  syncId: string;
  projectId: string;
  destination: PkiSync;
};

export type TTriggerPkiSyncImportCertificatesDTO = {
  syncId: string;
  projectId: string;
  destination: PkiSync;
};

export type TTriggerPkiSyncRemoveCertificatesDTO = {
  syncId: string;
  projectId: string;
  destination: PkiSync;
};

export * from "./common";
