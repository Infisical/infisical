import { TActorInput } from "@app/lib/types";

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
  projectId: string;
} & TActorInput;

export type TUpdatePkiApplicationDTO = {
  applicationId: string;
  name?: string;
  description?: string | null;
  projectId: string;
} & TActorInput;

export type TGetPkiApplicationDTO = {
  applicationId: string;
  projectId: string;
} & TActorInput;

export type TGetPkiApplicationByNameDTO = {
  name: string;
  projectId: string;
} & TActorInput;

export type TListPkiApplicationsDTO = {
  search?: string;
  limit?: number;
  offset?: number;
  applicationIds?: string[];
  projectId: string;
} & TActorInput;

export type TDeletePkiApplicationDTO = {
  applicationId: string;
  projectId: string;
} & TActorInput;

export type TAttachProfilesDTO = {
  applicationId: string;
  profileIds: string[];
  projectId: string;
} & TActorInput;

export type TDetachProfileDTO = {
  applicationId: string;
  profileId: string;
  projectId: string;
} & TActorInput;

export type TListApplicationProfilesDTO = {
  applicationId: string;
  projectId: string;
} & TActorInput;

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
  projectId: string;
} & TActorInput;

export enum ApplicationMemberKind {
  User = "user",
  Identity = "identity",
  Group = "group"
}

export type TApplicationMemberKind = `${ApplicationMemberKind}`;

export type TListApplicationMembersDTO = {
  applicationId: string;
  kind?: TApplicationMemberKind;
  projectId: string;
} & TActorInput;

export type TUpdateApplicationMemberRoleDTO = {
  applicationId: string;
  kind: TApplicationMemberKind;
  memberId: string;
  role: string;
  projectId: string;
} & TActorInput;

export type TRemoveApplicationMemberDTO = {
  applicationId: string;
  kind: TApplicationMemberKind;
  memberId: string;
  projectId: string;
} & TActorInput;

export type TAddApplicationUserMembersDTO = {
  applicationId: string;
  userIds: string[];
  emails: string[];
  role: string;
  projectId: string;
} & TActorInput;
