import { WorkspaceEnv } from "@app/hooks/api/workspace/types";

export enum ReservedFolders {
  SecretReplication = "__reserve_replication_"
}

export enum PendingAction {
  Create = "create",
  Update = "update",
  Delete = "delete"
}

export type TSecretFolder = {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  isPending?: boolean;
  pendingAction?: PendingAction;
};

export type TSecretFolderWithPath = TSecretFolder & { path: string };

export type TProjectEnvironmentsFolders = {
  [key: string]: WorkspaceEnv & { folders: TSecretFolderWithPath[] };
};

export type TGetProjectFoldersDTO = {
  projectId: string;
  environment: string;
  path?: string;
};

export type TGetFoldersByEnvDTO = {
  environments: string[];
  projectId: string;
  path?: string;
};

export type TCreateFolderDTO = {
  projectId: string;
  environment: string;
  name: string;
  path?: string;
  description?: string | null;
};

export type TUpdateFolderDTO = {
  projectId: string;
  environment: string;
  name: string;
  folderId: string;
  path?: string;
  description?: string | null;
};

export type TDeleteFolderDTO = {
  projectId: string;
  environment: string;
  folderId: string;
  path?: string;
};

export type TUpdateFolderBatchDTO = {
  projectId: string;
  projectSlug: string;
  folders: {
    name: string;
    environment: string;
    id: string;
    path?: string;
    description?: string | null;
  }[];
};
