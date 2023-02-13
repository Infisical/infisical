import { UserWsKeyPair } from '../keys/types';

export type User = {
  createdAt: Date;
  updatedAt: Date;
  email?: string;
  firstName?: string;
  lastName?: string;
  encryptionVersion?: number;
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
  isMfaEnabled: boolean;
  seenIps: string[];
  _id: string;
  __v: number;
};

export type OrgUser = {
  _id: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    _id: string;
    publicKey: string;
  };
  inviteEmail: string;
  organization: string;
  role: 'owner' | 'admin' | 'member';
  status: 'invited' | 'accepted';
  deniedPermissions: any[];
};

export type AddUserToWsDTO = {
  workspaceId: string;
  email: string;
};

export type AddUserToWsRes = {
  invitee: OrgUser['user'];
  latestKey: UserWsKeyPair;
};
