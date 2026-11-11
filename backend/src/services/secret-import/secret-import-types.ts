import { TActorInput } from "@app/lib/types";

export type TCreateSecretImportDTO = {
  environment: string;
  path: string;
  data: {
    environment: string;
    path: string;
    sourceProjectId?: string;
  };
  isReplication?: boolean;
  projectId: string;
} & TActorInput;

export type TUpdateSecretImportDTO = {
  environment: string;
  path: string;
  id: string;
  data: Partial<{ environment: string; path: string; position: number }>;
  projectId: string;
} & TActorInput;

export type TResyncSecretImportReplicationDTO = {
  environment: string;
  path: string;
  id: string;
  projectId: string;
} & TActorInput;

export type TDeleteSecretImportDTO = {
  environment: string;
  path: string;
  id: string;
  projectId: string;
} & TActorInput;

export type TGetSecretImportsDTO = {
  environment: string;
  path: string;
  search?: string;
  limit?: number;
  offset?: number;
  projectId: string;
} & TActorInput;

export type TGetSecretImportByIdDTO = {
  id: string;
} & TActorInput;

export type TGetSecretsFromImportDTO = {
  environment: string;
  path: string;
  projectId: string;
} & TActorInput;

export type FolderResult = {
  envName: string;
  folderName: string;
  folderId: string;
  envSlug: string;
};

export type SecretResult = {
  secretId: string;
  referencedSecretKey: string;
  referencedSecretEnv: string;
} & FolderResult;

export type FolderInfo = {
  folderName: string;
  secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
  folderId: string;
  folderImported: boolean;
  envSlug?: string;
};

export type EnvironmentInfo = {
  envName: string;
  envSlug: string;
  projectName?: string;
  projectSlug?: string;
  projectId?: string;
  folders: FolderInfo[];
};
