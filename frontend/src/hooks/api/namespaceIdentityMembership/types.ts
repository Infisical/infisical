export enum NamespaceIdentityMembershipOrderBy {
  Name = "name"
}

export enum NamespaceIdentityMembershipTemporaryMode {
  Relative = "relative"
}

export enum OrderByDirection {
  ASC = "asc",
  DESC = "desc"
}

export type TNamespaceIdentityBasic = {
  id: string;
  name: string;
  authMethods: string[];
  hasDeleteProtection: boolean;
};

export type TNamespaceIdentityMembershipRole = {
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

export type TNamespaceIdentityMembership = {
  id: string;
  identity: TNamespaceIdentityBasic;
  roles: TNamespaceIdentityMembershipRole[];
  createdAt: string;
  updatedAt: string;
};

export type TCreateNamespaceIdentityMembershipDTO = {
  namespaceSlug: string;
  identityId: string;
  roles: Array<{
    role: string;
    isTemporary?: boolean;
    temporaryMode?: string;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  }>;
};

export type TUpdateNamespaceIdentityMembershipDTO = {
  namespaceSlug: string;
  identityId: string;
  roles: Array<{
    role: string;
    isTemporary?: boolean;
    temporaryMode?: string;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  }>;
};

export type TDeleteNamespaceIdentityMembershipDTO = {
  namespaceSlug: string;
  identityId: string;
};

export type TListNamespaceIdentityMembershipsDTO = {
  namespaceSlug: string;
  offset?: number;
  limit?: number;
  orderBy?: NamespaceIdentityMembershipOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TGetNamespaceIdentityMembershipByIdDTO = {
  namespaceSlug: string;
  identityId: string;
};
