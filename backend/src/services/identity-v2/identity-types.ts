import { AccessScope, AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas";
import { TSearchResourceOperator } from "@app/lib/search-resource/search";
import { OrderByDirection, OrgServiceActor, TOrgPermission } from "@app/lib/types";

export interface TIdentityV2Factory {
  onCreateIdentityGuard: (arg: TCreateIdentityV2DTO) => Promise<void>;
  onUpdateIdentityGuard: (arg: TUpdateIdentityV2DTO) => Promise<void>;
  onDeleteIdentityGuard: (arg: TDeleteIdentityV2DTO) => Promise<void>;
  onListIdentityGuard: (arg: TListIdentityV2DTO) => Promise<(arg: { identityId: string }) => boolean>;
  onGetIdentityByIdGuard: (arg: TGetIdentityByIdV2DTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
}

export enum IdentityOrderBy {
  Name = "name",
  Role = "role"
}

export type TCreateIdentityV2RoleDTO =
  | { role: string; isTemporary: false }
  | {
      role: string;
      isTemporary: true;
      temporaryMode: TemporaryPermissionMode;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    };

export type TCreateIdentityV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    name: string;
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
    roles?: TCreateIdentityV2RoleDTO[];
  };
};

export type TUpdateIdentityV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
  data: Partial<{
    name: string;
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
  }>;
};

export type TDeleteIdentityV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};

export type TGetIdentityByIdV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};

export type TListIdentityV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: Partial<{
    limit: number;
    offset: number;
    orderBy: IdentityOrderBy;
    orderDirection: OrderByDirection;
    search: string;
  }>;
};

// The v2 search endpoint joins Membership and can sort by lastLoginTime; the legacy
// v1 search / v2 identity-memberships endpoints bind orderBy straight into an
// `identity.<col>` SQL fragment and would fail with a 500 on LastLogin since the
// identities table has no such column. Keep this enum separate so the legacy paths
// reject lastLogin at the Zod boundary.
export enum OrgIdentitySearchOrderBy {
  Name = "name",
  Role = "role",
  LastLogin = "lastLogin"
}

export enum SearchIdentitiesScope {
  OrganizationScope = "organization",
  ProjectScope = "project"
}

// Translate a raw `Membership.scope` value into a SearchIdentitiesScope. The two enums share
// string values today but live in separate files — go through this helper so a future drift
// (extra AccessScope variant, renamed value) surfaces here instead of silently mistyping rows.
export const accessScopeToSearchIdentitiesScope = (scope: string): SearchIdentitiesScope => {
  switch (scope) {
    case AccessScope.Organization:
      return SearchIdentitiesScope.OrganizationScope;
    case AccessScope.Project:
      return SearchIdentitiesScope.ProjectScope;
    default:
      throw new Error(`Unexpected membership scope for identity search: ${scope}`);
  }
};

export type TSearchIdentitiesV2DAL = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentitySearchOrderBy;
  orderDirection?: OrderByDirection;
  orgId: string;
  scope: SearchIdentitiesScope[];
  accessibleProjectIds: string[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

export type TSearchIdentitiesV2DTO = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentitySearchOrderBy;
  orderDirection?: OrderByDirection;
  scope: SearchIdentitiesScope[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
} & TOrgPermission;

export type TCountIdentitiesV2DAL = {
  orgId: string;
  scope: SearchIdentitiesScope[];
  accessibleProjectIds: string[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

export type TCountIdentitiesV2DTO = {
  scope: SearchIdentitiesScope[];
  searchFilter?: Partial<{
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
} & TOrgPermission;
