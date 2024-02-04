import { ProjectMembershipRole } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TGetProjectMembershipDTO = TProjectPermission;

export type TInviteUserToProjectDTO = {
  email: string;
} & TProjectPermission;

export type TUpdateProjectMembershipDTO = {
  membershipId: string;
  role: string;
} & TProjectPermission;

export type TDeleteProjectMembershipDTO = {
  membershipId: string;
} & TProjectPermission;

export type TAddUsersToWorkspaceDTO = {
  members: {
    orgMembershipId: string;
    workspaceEncryptedKey: string;
    workspaceEncryptedNonce: string;
    projectRole: ProjectMembershipRole;
  }[];
} & TProjectPermission;
