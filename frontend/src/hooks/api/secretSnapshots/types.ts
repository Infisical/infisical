import { SecretVersions } from "../secrets/types";
import { ProjectEnv } from "../types";

export type TSecretSnapshot = {
  id: string;
  projectId: string;
  secretVersions: string[];
  createdAt: string;
  updatedAt: string;
};

export type TSnapshotData = Omit<TSecretSnapshot, "secretVersions"> & {
  id: string;
  secretVersions: (SecretVersions & { isRotatedSecret?: boolean })[];
  folderVersion: Array<{ name: string; id: string }>;
  environment: ProjectEnv;
};

export type TSnapshotDataProps = {
  snapshotId: string;
  env: string;
};

export type TGetSecretSnapshotsDTO = {
  projectId: string;
  limit: number;
  environment: string;
  directory?: string;
};

export type TSecretRollbackDTO = {
  snapshotId: string;
  projectId: string;
  environment: string;
  directory?: string;
};
