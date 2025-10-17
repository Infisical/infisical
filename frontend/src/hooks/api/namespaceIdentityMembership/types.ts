import { IdentityAuthMethod } from "../identities";

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
  authMethods: IdentityAuthMethod[];
  hasDeleteProtection: boolean;
  scopeNamespaceId?: string;
  scopeProjectId?: string;
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
  namespaceId: string;
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
  namespaceId: string;
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
  namespaceId: string;
  identityId: string;
};

export type TListNamespaceIdentityMembershipsDTO = {
  namespaceId: string;
  offset?: number;
  limit?: number;
  orderBy?: NamespaceIdentityMembershipOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TGetNamespaceIdentityMembershipByIdDTO = {
  namespaceId: string;
  identityId: string;
};
