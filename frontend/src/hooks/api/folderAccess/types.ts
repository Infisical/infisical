export enum SecretFolderRole {
  List = "list",
  Read = "read",
  Edit = "edit",
  Manage = "manage",
  FullAccess = "full-access"
}

export type TFolderGrantType =
  | { isTemporary: false }
  | {
      isTemporary: true;
      temporaryMode: "relative";
      temporaryRange: string;
      temporaryAccessStartTime: string;
    };

export type TFolderAccess = {
  id: string;
  projectId: string;
  folderId: string;
  permission: SecretFolderRole;
  environment: string;
  secretPath: string;
  isTemporary: boolean;
  temporaryMode: string | null;
  temporaryRange: string | null;
  temporaryAccessStartTime: string | null;
  temporaryAccessEndTime: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TFolderAccessRole = {
  id: string | null;
  slug: string;
  name: string;
};

// id is null when the actor reaches the project only through a group
export type TFolderAccessMembership = {
  id: string | null;
  isProjectAdmin: boolean;
  roles: TFolderAccessRole[];
};

export type TFolderAccessUser = {
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  membership: TFolderAccessMembership;
  folderRBACAccess: TFolderAccess | null;
};

export type TFolderAccessIdentity = {
  identityId: string;
  name: string;
  membership: TFolderAccessMembership;
  folderRBACAccess: TFolderAccess | null;
};

// `users` have access on the folder and membership.roles holds only the roles granting it (empty
// when the access comes from the folder grant alone). `usersWithoutAccess` have none, their
// membership.roles holds every role, and folderRBACAccess is always null. search/offset/limit
// apply to each group independently.
export type TListFolderAccessUsersResponse = {
  users: TFolderAccessUser[];
  usersWithoutAccess: TFolderAccessUser[];
  totalCount: number;
};

export type TListFolderAccessIdentitiesResponse = {
  identities: TFolderAccessIdentity[];
  identitiesWithoutAccess: TFolderAccessIdentity[];
  totalCount: number;
};

export type TUserFolderAccess = TFolderAccess & { userId: string };

export type TIdentityFolderAccess = TFolderAccess & { identityId: string };

export type TListUserFolderAccessDTO = {
  projectId: string;
  userId: string;
};

export type TListIdentityFolderAccessDTO = {
  projectId: string;
  identityId: string;
};

export type TListFolderAccessActorsDTO = {
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  offset?: number;
  limit?: number;
  search?: string;
};

type TFolderAccessTargetDTO = {
  projectId: string;
  environmentSlug: string;
  secretPath: string;
};

export type TCreateUserFolderAccessDTO = TFolderAccessTargetDTO & {
  userId: string;
  permission: SecretFolderRole;
  type?: TFolderGrantType;
};

export type TUpdateUserFolderAccessDTO = TFolderAccessTargetDTO & {
  userId: string;
  permission?: SecretFolderRole;
  type?: TFolderGrantType;
};

export type TDeleteUserFolderAccessDTO = TFolderAccessTargetDTO & {
  userId: string;
};

export type TCreateIdentityFolderAccessDTO = TFolderAccessTargetDTO & {
  identityId: string;
  permission: SecretFolderRole;
  type?: TFolderGrantType;
};

export type TUpdateIdentityFolderAccessDTO = TFolderAccessTargetDTO & {
  identityId: string;
  permission?: SecretFolderRole;
  type?: TFolderGrantType;
};

export type TDeleteIdentityFolderAccessDTO = TFolderAccessTargetDTO & {
  identityId: string;
};
