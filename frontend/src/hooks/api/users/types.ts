import { UserWsKeyPair } from '../keys/types';

export type User = {
  seenIps: string[];
  _id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
  firstName: string;
  lastName: string;
  publicKey: string;
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
