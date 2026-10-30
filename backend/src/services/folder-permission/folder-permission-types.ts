import { SecretFolderRole, TAdditionalPrivileges, TemporaryPermissionMode } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";

export type TFolderGrantActor = {
  actorId: string;
  actorType: ActorType.USER | ActorType.IDENTITY;
};

export type TFolderGrantTypeInput =
  | { isTemporary: false }
  | {
      isTemporary: true;
      temporaryMode: TemporaryPermissionMode;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    };

export type TResolvedFolder = {
  id: string;
  path: string;
  environmentSlug: string;
};

export type TCreateFolderGrantDTO = {
  permission: OrgServiceActor;
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  target: TFolderGrantActor;
  role: SecretFolderRole;
  // undefined means a permanent grant
  type?: TFolderGrantTypeInput;
};

export type TUpdateFolderGrantDTO = {
  permission: OrgServiceActor;
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  target: TFolderGrantActor;
  role?: SecretFolderRole;
  // undefined leaves the temporal state unchanged; { isTemporary: false } makes the grant
  // permanent; a temporary payload restarts the window from its start time
  type?: TFolderGrantTypeInput;
};

export type TDeleteFolderGrantDTO = {
  permission: OrgServiceActor;
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  target: TFolderGrantActor;
};

export type TListActorFolderGrantsDTO = {
  permission: OrgServiceActor;
  projectId: string;
  target: TFolderGrantActor;
};

export type TListFolderAccessActorsDTO = {
  permission: OrgServiceActor;
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  limit: number;
  offset: number;
  search?: string;
};

export type TFolderGrant = {
  id: string;
  projectId: string;
  folderId: string;
  permission: SecretFolderRole;
  environment: string;
  secretPath: string;
  isTemporary: boolean;
  temporaryMode: string | null;
  temporaryRange: string | null;
  temporaryAccessStartTime: Date | null;
  temporaryAccessEndTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TFolderAccessRole = {
  id: string | null;
  slug: string;
  name: string;
};

export type TFolderAccessMembership = {
  id: string | null;
  isProjectAdmin: boolean;
  roles: TFolderAccessRole[];
};

export type TProjectMemberRoleRow = {
  membershipRoleId: string;
  role: string;
  customRoleId: string | null;
  customRoleSlug: string | null;
  customRoleName: string | null;
  customRolePermissions: unknown;
  isTemporary: boolean;
  temporaryAccessEndTime: Date | null;
};

export type TCachedProjectMemberRole = TFolderAccessRole & {
  isTemporary: boolean;
  temporaryAccessEndTime: Date | null;
};

export type TProjectMemberActor = { membershipId: string | null };

export type TProjectMemberUser = TProjectMemberActor & {
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type TProjectMemberIdentity = TProjectMemberActor & {
  identityId: string;
  name: string;
};

export type TProjectMember<TActor extends TProjectMemberActor> = {
  actor: TActor;
  roles: TProjectMemberRoleRow[];
};

export type TCachedFolderAccess<TActor extends TProjectMemberActor> = {
  actors: { actor: TActor; roles: TCachedProjectMemberRole[] }[];
  grantingRoleKeys: string[];
  totalCount: number;
};

export type TFolderAccessEntry<TActor extends TProjectMemberActor> = {
  actor: TActor;
  membership: TFolderAccessMembership;
  grant: TAdditionalPrivileges | null;
};
