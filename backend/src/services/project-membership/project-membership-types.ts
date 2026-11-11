import { TActorInput, TProjectPermission } from "@app/lib/types";

export type TGetProjectMembershipDTO = {
  includeGroupMembers?: boolean;
  roles?: string[];
  projectId: string;
} & TActorInput;
export type TLeaveProjectDTO = { projectId: string } & TActorInput;
export enum ProjectUserMembershipTemporaryMode {
  Relative = "relative"
}

export type TInviteUserToProjectDTO = {
  emails: string[];
} & TProjectPermission;

export type TGetProjectMembershipByUsernameDTO = {
  username: string;
  projectId: string;
} & TActorInput;

export type TGetProjectMembershipByIdDTO = {
  id: string;
} & TProjectPermission;

export type TUpdateProjectMembershipDTO = {
  membershipId: string;
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
} & TProjectPermission;

export type TDeleteProjectMembershipOldDTO = {
  membershipId: string;
} & TProjectPermission;

export type TDeleteProjectMembershipsDTO = {
  emails: string[];
  usernames: string[];
  projectId: string;
} & TActorInput;

export type TAddUsersToWorkspaceDTO = {
  sendEmails?: boolean;
  members: {
    orgMembershipId: string;
    workspaceEncryptedKey: string;
    workspaceEncryptedNonce: string;
  }[];
  projectId: string;
} & TActorInput;

export type TAddUsersToWorkspaceNonE2EEDTO = {
  sendEmails?: boolean;
  emails: string[];
  usernames: string[];
  roleSlugs?: string[];
} & TProjectPermission;
