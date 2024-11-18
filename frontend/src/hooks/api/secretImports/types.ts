import { SecretV3Raw } from "../secrets/types";
import { WorkspaceEnv } from "../workspace/types";

export type TSecretImport = {
  id: string;
  folderId: string;
  importPath: string;
  importEnv: WorkspaceEnv;
  position: string;
  createdAt: string;
  updatedAt: string;
  isReserved?: boolean;
  isReplication?: boolean;
  isReplicationSuccess?: boolean;
  replicationStatus?: string;
  lastReplicated?: string;
};

export type TGetImportedFoldersByEnvDTO = {
  projectId: string;
  environment: string;
  path?: string;
};

export type TImportedSecrets = {
  environment: string;
  environmentInfo: WorkspaceEnv;
  secretPath: string;
  folderId: string;
  secrets: SecretV3Raw[];
};

export type TGetSecretImports = {
  projectId: string;
  environment: string;
  path?: string;
};

export type TGetSecretImportsAllEnvs = {
  projectId: string;
  path?: string;
  environments: string[];
};

export type TGetImportedSecrets = {
  projectId: string;
  environment: string;
  path?: string;
};

export type TuseGetImportedFoldersByEnv = {
  environments: string[];
  projectId: string;
  path?: string;
};

export type TCreateSecretImportDTO = {
  projectId: string;
  environment: string;
  path?: string;
  import: {
    environment: string;
    path: string;
  };
  isReplication?: boolean;
};

export type TUpdateSecretImportDTO = {
  id: string;
  projectId: string;
  environment: string;
  path?: string;
  import: Partial<{
    environment: string;
    path: string;
    position: number;
  }>;
};

export type TResyncSecretReplicationDTO = {
  id: string;
  projectId: string;
  environment: string;
  path?: string;
};

export type TDeleteSecretImportDTO = {
  id: string;
  projectId: string;
  environment: string;
  path?: string;
};
