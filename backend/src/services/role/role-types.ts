import { MongoAbility, RawRuleOf } from "@casl/ability";

import { AccessScopeData, TRoles } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";

export interface TRoleScopeFactory {
  onCreateRoleGuard: (arg: TCreateRoleDTO) => Promise<void>;
  onUpdateRoleGuard: (arg: TUpdateRoleDTO) => Promise<void>;
  onDeleteRoleGuard: (arg: TDeleteRoleDTO) => Promise<void>;
  onListRoleGuard: (arg: TListRoleDTO) => Promise<void>;
  getPredefinedRoles: (arg: AccessScopeData) => Promise<(TRoles & { permissions: RawRuleOf<MongoAbility>[] })[]>;
  onGetRoleByIdGuard: (arg: TGetRoleByIdDTO) => Promise<void>;
  onGetRoleBySlugGuard: (arg: TGetRoleBySlugDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
  isCustomRole: (role: string) => boolean;
}

export type TCreateRoleDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  data: {
    name: string;
    description?: string | null;
    slug: string;
    permissions: unknown;
  };
};

export type TUpdateRoleDTO = {
  actor: TActorContext;
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
  actor: TActorContext;
  scopeData: AccessScopeData;
  data: {
    limit?: number;
    offset?: number;
  };
};

export type TDeleteRoleDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    id: string;
  };
};

export type TGetRoleByIdDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    id: string;
  };
};

export type TGetProjectRoleByIdDTO = {
  actor: TActorContext;
  selector: {
    id: string;
  };
};

export type TGetRoleBySlugDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    slug: string;
  };
};

export type TGetUserPermissionDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
};
