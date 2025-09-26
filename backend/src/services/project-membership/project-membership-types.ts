import { TProjectPermission } from "@app/lib/types";

export type TGetProjectMembershipDTO = { includeGroupMembers?: boolean; roles?: string[] } & TProjectPermission;
export type TLeaveProjectDTO = Omit<TProjectPermission, "actorOrgId" | "actorAuthMethod">;
export enum ProjectUserMembershipTemporaryMode {
  Relative = "relative"
}

export type TInviteUserToProjectDTO = {
  emails: string[];
} & TProjectPermission;

export type TGetProjectMembershipByUsernameDTO = {
  username: string;
} & TProjectPermission;

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
} & TProjectPermission;

export type TAddUsersToProjectV1DTO = {
  sendEmails?: boolean;
  members: {
    orgMembershipId: string;
    workspaceEncryptedKey: string;
    workspaceEncryptedNonce: string;
  }[];
} & TProjectPermission;

export type TAddUsersToProjectV2DTO = {
  sendEmails?: boolean;
  validatedInvitedUsers: { id: string; username: string; email?: string | null }[];
  projects?: {
    id: string;
    projectRoleSlug?: string[];
  }[];
} & Omit<TProjectPermission, "projectId">;

export type TAddUsersToProjectNonE2EEDTO = {
  sendEmails?: boolean;
  emails: string[];
  usernames: string[];
  roleSlugs?: string[];
} & TProjectPermission;

export type TAddUsersToProjectDTO = {
  sendEmails?: boolean;
  members: {
    orgMembershipId: string;
    workspaceEncryptedKey: string;
    workspaceEncryptedNonce: string;
  }[];
} & TProjectPermission;
