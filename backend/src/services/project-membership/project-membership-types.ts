import { TProjectPermission } from "@app/lib/types";

export type TGetProjectMembershipDTO = { includeGroupMembers?: boolean } & TProjectPermission;
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

export type TAddUsersToWorkspaceDTO = {
  sendEmails?: boolean;
  members: {
    orgMembershipId: string;
    workspaceEncryptedKey: string;
    workspaceEncryptedNonce: string;
  }[];
} & TProjectPermission;

export type TAddUsersToWorkspaceNonE2EEDTO = {
  sendEmails?: boolean;
  emails: string[];
  usernames: string[];
} & TProjectPermission;
