import { OrderByDirection, TNamespacePermission } from "@app/lib/types";
import { NamespaceUserMembershipTemporaryMode } from "../namespace-user-membership/namespace-user-membership-types";
import { TSearchResourceOperator } from "@app/lib/search-resource/search";

// TODO(namespace): add audit log for various events
export type TCreateNamespaceIdentityMembershipDTO = {
  identityId: string;
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: NamespaceUserMembershipTemporaryMode.Relative;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
  permission: TNamespacePermission;
};

export type TUpdateNamespaceIdentityMembershipDTO = {
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: NamespaceUserMembershipTemporaryMode.Relative;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
  identityId: string;
  permission: TNamespacePermission;
};

export type TDeleteNamespaceIdentityMembershipDTO = {
  identityId: string;
  permission: TNamespacePermission;
};

export type TListNamespaceIdentityMembershipDTO = {
  limit?: number;
  offset?: number;
  orderBy?: NamespaceIdentityMembershipOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  permission: TNamespacePermission;
};

export type TGetNamespaceIdentityMembershipByIdentityIdDTO = {
  identityId: string;
  permission: TNamespacePermission;
};

export type TGetNamespaceIdentityMembershipByMembershipIdDTO = {
  identityMembershipId: string;
  permission: TNamespacePermission;
};

export enum NamespaceIdentityMembershipOrderBy {
  Name = "name"
}

export enum NamespaceIdentityOrderBy {
  Name = "name",
  Role = "role"
}

export type TSearchNamespaceIdentitiesDAL = {
  limit?: number;
  offset?: number;
  orderBy?: NamespaceIdentityOrderBy;
  orderDirection?: OrderByDirection;
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

export interface TSearchNamespaceIdentitiesDTO extends TSearchNamespaceIdentitiesDAL {
  permission: TNamespacePermission;
}
