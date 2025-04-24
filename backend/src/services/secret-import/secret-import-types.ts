import { TProjectPermission } from "@app/lib/types";

export type TCreateSecretImportDTO = {
  environment: string;
  path: string;
  data: {
    environment: string;
    path: string;
  };
  isReplication?: boolean;
} & TProjectPermission;

export type TUpdateSecretImportDTO = {
  environment: string;
  path: string;
  id: string;
  data: Partial<{ environment: string; path: string; position: number }>;
} & TProjectPermission;

export type TResyncSecretImportReplicationDTO = {
  environment: string;
  path: string;
  id: string;
} & TProjectPermission;

export type TDeleteSecretImportDTO = {
  environment: string;
  path: string;
  id: string;
} & TProjectPermission;

export type TGetSecretImportsDTO = {
  environment: string;
  path: string;
  search?: string;
  limit?: number;
  offset?: number;
} & TProjectPermission;

export type TGetSecretImportByIdDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetSecretsFromImportDTO = {
  environment: string;
  path: string;
} & TProjectPermission;

export type FolderResult = {
  envName: string;
  folderName: string;
  folderId: string;
  envSlug: string;
};

export type SecretResult = {
  secretId: string;
  referencedSecretKey: string;
} & FolderResult;

export type FolderInfo = {
  folderName: string;
  secrets?: { secretId: string; referencedSecretKey: string }[];
  folderId: string;
  folderImported: boolean;
  envSlug?: string;
};

export type EnvironmentInfo = {
  envName: string;
  envSlug: string;
  folders: FolderInfo[];
};
