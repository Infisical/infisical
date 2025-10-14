export type TNamespaceUser = {
  email: string;
  firstName: string;
  lastName: string;
  id: string;
  username: string;
  isEmailVerified?: boolean;
};

export enum NamespaceUserMembershipTemporaryMode {
  Relative = "relative"
}

export type TNamespaceMembershipRole = {
  id: string;
  role: string;
  customRoleId?: string | null;
  customRoleName?: string | null;
  customRoleSlug?: string | null;
  isTemporary: boolean;
  temporaryMode?: string | null;
  temporaryRange?: string | null;
  temporaryAccessStartTime?: string | null;
  temporaryAccessEndTime?: string | null;
};

export type TNamespaceMembership = {
  id: string;
  user: TNamespaceUser;
  roles: TNamespaceMembershipRole[];
  createdAt: string;
  updatedAt: string;
  lastLoginAuthMethod?: string | null;
  lastLoginTime?: string | null;
  metadata?: {
    id: string;
    key: string;
    value: string;
  }[];
};

export type TListNamespaceMembershipsDTO = {
  namespaceId: string;
  offset?: number;
  limit?: number;
};

export type TGetNamespaceMembershipByIdDTO = {
  namespaceId: string;
  userId: string;
};

export type TSearchNamespaceMembershipsDTO = {
  namespaceId: string;
  username?: string;
  offset?: number;
  limit?: number;
};

export type TUpdateNamespaceMembershipDTO = {
  namespaceId: string;
  userId: string;
  roles: Array<{
    role: string;
    isTemporary?: boolean;
    temporaryMode?: string;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  }>;
};

export type TDeleteNamespaceMembershipDTO = {
  namespaceId: string;
  userId: string;
};

export type TAddUsersToNamespaceDTO = {
  namespaceId: string;
  usernames: string[];
  roles: Array<{
    role: string;
    isTemporary?: boolean;
    temporaryMode?: string;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  }>;
};
