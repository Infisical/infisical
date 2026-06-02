import { TProjectPermission } from "@app/lib/types";

type TActorPermission = Omit<TProjectPermission, "projectId"> & { projectId: string };

export type TSignerMember = {
  membershipId: string;
  signerId: string;
  signerName?: string;
  actorUserId?: string | null;
  actorIdentityId?: string | null;
  actorGroupId?: string | null;
  role: string;
  customRoleId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  details?: {
    name: string | null;
    email?: string | null;
    username?: string | null;
    authMethod?: string | null;
    slug?: string | null;
  } | null;
};

export type TAddSignerMemberDTO = {
  signerId: string;
  userId?: string;
  identityId?: string;
  groupId?: string;
  role: string;
} & TActorPermission;

export enum SignerMemberKind {
  User = "user",
  Identity = "identity",
  Group = "group"
}

export type TSignerMemberKind = `${SignerMemberKind}`;

export type TListSignerMembersDTO = {
  signerId: string;
  kind?: TSignerMemberKind;
} & TActorPermission;

export enum EffectiveSignerMemberKind {
  User = "user",
  Identity = "identity"
}

export type TEffectiveSignerMemberKind = `${EffectiveSignerMemberKind}`;

export type TListEffectiveSignerMembersDTO = {
  signerId: string;
  kind: TEffectiveSignerMemberKind;
} & TActorPermission;

export type TEffectiveSignerMember = {
  actorUserId: string | null;
  actorIdentityId: string | null;
  role: string;
  viaGroupIds: string[];
  isDirect: boolean;
  details: {
    name: string | null;
    email?: string | null;
    username?: string | null;
    authMethod?: string | null;
  } | null;
};

export type TUpdateSignerMemberRoleDTO = {
  signerId: string;
  kind: TSignerMemberKind;
  memberId: string;
  role: string;
} & TActorPermission;

export type TRemoveSignerMemberDTO = {
  signerId: string;
  kind: TSignerMemberKind;
  memberId: string;
} & TActorPermission;

export type TAddSignerUserMembersDTO = {
  signerId: string;
  userIds: string[];
  emails: string[];
  role: string;
} & TActorPermission;
