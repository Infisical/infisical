import { ProjectMembershipRole } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TGetProjectMembershipDTO = TProjectPermission;

export type TInviteUserToProjectDTO = {
  emails: string[];
} & TProjectPermission;

export type TUpdateProjectMembershipDTO = {
  membershipId: string;
  role: string;
} & TProjectPermission;

export type TDeleteProjectMembershipDTO = {
  membershipId: string;
} & TProjectPermission;

export type TAddUsersToWorkspaceDTO = {
  sendEmails?: boolean;
  members: {
    orgMembershipId: string;
    workspaceEncryptedKey: string;
    workspaceEncryptedNonce: string;
    projectRole: ProjectMembershipRole;
  }[];
} & TProjectPermission;

export type TAddUsersToWorkspaceNonE2EEDTO = {
  sendEmails?: boolean;
  emails: string[];
} & TProjectPermission;
