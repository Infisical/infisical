import { SecretVersions } from "../secrets/types";
import { WorkspaceEnv } from "../types";

export type TSecretSnapshot = {
  id: string;
  workspace: string;
  secretVersions: string[];
  createdAt: string;
  updatedAt: string;
};

export type TSnapshotData = Omit<TSecretSnapshot, "secretVersions"> & {
  id: string;
  secretVersions: SecretVersions[];
  folderVersion: Array<{ name: string; id: string }>;
  environment: WorkspaceEnv;
};

export type TSnapshotDataProps = {
  snapshotId: string;
  env: string;
};

export type TGetSecretSnapshotsDTO = {
  workspaceId: string;
  limit: number;
  environment: string;
  directory?: string;
};

export type TSecretRollbackDTO = {
  snapshotId: string;
  workspaceId: string;
  environment: string;
  directory?: string;
};
