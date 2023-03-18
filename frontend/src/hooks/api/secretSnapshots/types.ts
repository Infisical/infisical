import { UserWsKeyPair } from '../keys/types';
import { EncryptedSecretVersion } from '../secrets/types';

export type TWorkspaceSecretSnapshot = {
  _id: string;
  workspace: string;
  version: number;
  secretVersions: string[];
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type TSnapshotSecret = Omit<TWorkspaceSecretSnapshot, 'secretVersions'> & {
  secretVersions: EncryptedSecretVersion[];
};

export type TSnapshotSecretProps = {
  snapshotId: string;
  env: string;
  decryptFileKey: UserWsKeyPair;
};

export type GetWorkspaceSecretSnapshotsDTO = {
  workspaceId: string;
  limit: number;
};

export type TSecretRollbackDTO = {
  workspaceId: string;
  version: number;
};
