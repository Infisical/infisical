import { OrderByDirection } from "../generic/types";
import { IdentityAuthMethod } from "../identities/enums";

export enum NamespaceIdentityOrderBy {
  Name = "name"
}

export enum NamespaceIdentityMembershipOrderBy {
  Name = "name"
}

export type TNamespaceIdentity = {
  id: string;
  name: string;
  authMethods: IdentityAuthMethod[];
  activeLockoutAuthMethods: IdentityAuthMethod[];
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
  identity: TNamespaceIdentity;
  roles: TNamespaceIdentityMembershipRole[];
  lastLoginAuthMethod?: IdentityAuthMethod;
  lastLoginTime?: string;
  metadata: Array<{ key: string; value: string; id: string }>;
  createdAt: string;
  updatedAt: string;
};

export type TCreateNamespaceIdentityDTO = {
  namespaceName: string;
  name: string;
  hasDeleteProtection?: boolean;
  metadata?: Array<{ key: string; value: string }>;
};

export type TSearchNamespaceIdentitiesDTO = {
  namespaceName: string;
  orderBy?: NamespaceIdentityOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
  search?: {
    name?:
      | string
      | {
          $eq?: string;
          $contains?: string;
          $in?: string[];
        };
    role?:
      | string
      | {
          $eq?: string;
          $in?: string[];
        };
  };
};

export type TListNamespaceIdentityMembershipsDTO = {
  namespaceName: string;
  offset?: number;
  limit?: number;
  orderBy?: NamespaceIdentityMembershipOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TGetNamespaceIdentityMembershipByIdDTO = {
  namespaceName: string;
  identityId: string;
};

export type TUpdateNamespaceIdentityDTO = {
  namespaceName: string;
  identityId: string;
  name?: string;
  hasDeleteProtection?: boolean;
  metadata?: Array<{ key: string; value: string }>;
};

export type TDeleteNamespaceIdentityDTO = {
  namespaceName: string;
  identityId: string;
};
