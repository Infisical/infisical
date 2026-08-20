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

export type TFolderAccessUser = {
  userId: string;
  membershipId: string | null;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  folderRBACAccess: TFolderAccess | null;
};

export type TFolderAccessIdentity = {
  identityId: string;
  name: string;
  folderRBACAccess: TFolderAccess | null;
};

export type TListFolderAccessActorsDTO = {
  projectId: string;
  folderId: string;
  offset?: number;
  limit?: number;
  search?: string;
};

type TFolderAccessTargetDTO = {
  projectId: string;
  folderId: string;
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
