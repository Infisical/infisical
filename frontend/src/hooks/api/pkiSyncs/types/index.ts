import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { DiscriminativePick } from "@app/types";

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

export type TPkiSync = TAzureKeyVaultPkiSync;

export type TListPkiSyncs = { pkiSyncs: TPkiSync[] };

export type TListPkiSyncOptions = { pkiSyncOptions: TPkiSyncOption[] };

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

export * from "./common";
