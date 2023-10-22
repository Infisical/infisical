import { UserWsKeyPair } from "../keys/types";
import { EncryptedSecretVersion } from "../secrets/types";

export type TSecretSnapshot = {
  _id: string;
  workspace: string;
  version: number;
  secretVersions: string[];
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type TSnapshotData = Omit<TSecretSnapshot, "secretVersions"> & {
  secretVersions: EncryptedSecretVersion[];
  folderVersion: Array<{ name: string; id: string }>;
};

export type TSnapshotDataProps = {
  snapshotId: string;
  env: string;
  decryptFileKey: UserWsKeyPair;
};

export type TGetSecretSnapshotsDTO = {
  workspaceId: string;
  limit: number;
  environment: string;
  directory?: string;
};

export type TSecretRollbackDTO = {
  workspaceId: string;
  version: number;
  environment: string;
  directory?: string;
};
