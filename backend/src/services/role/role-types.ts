import { MongoAbility, RawRuleOf } from "@casl/ability";

import { AccessScopeData } from "@app/db/schemas/models";
import { TRoles } from "@app/db/schemas/roles";
import { OrgServiceActor } from "@app/lib/types";

export interface TRoleScopeFactory {
  onCreateRoleGuard: (arg: TCreateRoleDTO) => Promise<void>;
  onUpdateRoleGuard: (arg: TUpdateRoleDTO) => Promise<void>;
  onDeleteRoleGuard: (arg: TDeleteRoleDTO) => Promise<void>;
  onListRoleGuard: (arg: TListRoleDTO) => Promise<void>;
  getPredefinedRoles: (arg: AccessScopeData) => Promise<(TRoles & { permissions: RawRuleOf<MongoAbility>[] })[]>;
  onGetRoleByIdGuard: (arg: TGetRoleByIdDTO) => Promise<void>;
  onGetRoleBySlugGuard: (arg: TGetRoleBySlugDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "namespaceId" | "projectId"; value: string };
  isCustomRole: (role: string) => boolean;
}

export type TCreateRoleDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    name: string;
    description?: string | null;
    slug: string;
    permissions: unknown;
  };
};

export type TUpdateRoleDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
  };
  data: Partial<{
    name: string;
    description?: string | null;
    slug: string;
    permissions: unknown;
  }>;
};

export type TListRoleDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    limit?: number;
    offset?: number;
  };
};

export type TDeleteRoleDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
  };
};

export type TGetRoleByIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
  };
};

export type TGetRoleBySlugDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    slug: string;
  };
};

export type TGetUserPermissionDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
};
