import { TProjectPermission } from "@app/lib/types";

export type TPkiApplicationListItem = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  profileCount: number;
  memberCount: number;
  certificateCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TPkiApplicationProfile = {
  applicationId: string;
  profileId: string;
  profileSlug: string;
  profileDescription?: string | null;
  estConfigId?: string | null;
  apiConfigId?: string | null;
  acmeConfigId?: string | null;
  scepConfigId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TCreatePkiApplicationDTO = {
  name: string;
  description?: string;
  profileIds?: string[];
} & TProjectPermission;

export type TUpdatePkiApplicationDTO = {
  applicationId: string;
  name?: string;
  description?: string | null;
} & TProjectPermission;

export type TGetPkiApplicationDTO = {
  applicationId: string;
} & TProjectPermission;

export type TGetPkiApplicationByNameDTO = {
  name: string;
} & TProjectPermission;

export type TListPkiApplicationsDTO = {
  search?: string;
  limit?: number;
  offset?: number;
  applicationIds?: string[];
} & TProjectPermission;

export type TDeletePkiApplicationDTO = {
  applicationId: string;
} & TProjectPermission;

export type TAttachProfilesDTO = {
  applicationId: string;
  profileIds: string[];
} & TProjectPermission;

export type TDetachProfileDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

export type TListApplicationProfilesDTO = {
  applicationId: string;
} & TProjectPermission;

export type TApplicationMember = {
  membershipId: string;
  applicationId: string;
  applicationName?: string;
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

export type TAddApplicationMemberDTO = {
  applicationId: string;
  userId?: string;
  identityId?: string;
  groupId?: string;
  role: string;
} & TProjectPermission;

export enum ApplicationMemberKind {
  User = "user",
  Identity = "identity",
  Group = "group"
}

export type TApplicationMemberKind = `${ApplicationMemberKind}`;

export type TListApplicationMembersDTO = {
  applicationId: string;
  kind?: TApplicationMemberKind;
} & TProjectPermission;

export type TUpdateApplicationMemberRoleDTO = {
  applicationId: string;
  kind: TApplicationMemberKind;
  memberId: string;
  role: string;
} & TProjectPermission;

export type TRemoveApplicationMemberDTO = {
  applicationId: string;
  kind: TApplicationMemberKind;
  memberId: string;
} & TProjectPermission;

export type TAddApplicationUserMembersDTO = {
  applicationId: string;
  userIds: string[];
  emails: string[];
  role: string;
} & TProjectPermission;
