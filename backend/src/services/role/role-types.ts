import { AccessScopeData } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

export type TPredefinedRole = {
  id: string;
  slug: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  permissions: { action: string[]; subject?: string; inverted?: boolean; conditions?: unknown }[];
  orgId?: string | null;
  projectId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface TRoleScopeFactory {
  onCreateRoleGuard: (arg: TCreateRoleDTO) => Promise<void>;
  onUpdateRoleGuard: (arg: TUpdateRoleDTO) => Promise<void>;
  onDeleteRoleGuard: (arg: TDeleteRoleDTO) => Promise<void>;
  onListRoleGuard: (arg: TListRoleDTO) => Promise<void>;
  onGetRoleByIdGuard: (arg: TGetRoleByIdDTO) => Promise<void>;
  onGetRoleBySlugGuard: (arg: TGetRoleBySlugDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
  getPredefinedRoles: (scope: AccessScopeData) => TPredefinedRole[];
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
