export type TGetRolesDTO = {
  orgId: string;
  workspaceId?: string;
};

// @depreciated
export type TRole<T extends string | undefined> = {
  id: string;
  organization: string;
  workspace: T;
  name: string;
  description: string;
  slug: string;
  permissions: T extends string ? TProjectPermission[] : TPermission[];
  createdAt: string;
  updatedAt: string;
};

export type TOrgRole = {
  slug: string;
  name: string;
  orgId: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  permissions: TPermission[];
};

export type TPermission = {
  conditions?: Record<string, any>;
  action: string;
  subject: string;
};

export type TProjectPermission = {
  conditions?: Record<string, any>;
  action: string;
  subject: string;
};

export type TCreateRoleDTO<T extends string | undefined> = {
  orgId: string;
  workspaceId?: T;
  name: string;
  description?: string;
  slug: string;
  permissions: T extends string ? TProjectPermission[] : TPermission[];
};

export type TUpdateRoleDTO<T extends string | undefined> = {
  orgId: string;
  id: string;
  workspaceId?: T;
} & Partial<Omit<TCreateRoleDTO<T>, "orgId" | "workspaceId">>;

export type TDeleteRoleDTO = {
  orgId: string;
  id: string;
  workspaceId?: string;
};

export type TGetUserOrgPermissionsDTO = {
  orgId: string;
};

export type TGetUserProjectPermissionDTO = {
  workspaceId: string;
};

export type TCreateOrgRoleDTO = {
  orgId: string;
  name: string;
  description?: string;
  slug: string;
  permissions: TPermission[];
};

export type TUpdateOrgRoleDTO = {
  orgId: string;
  id: string;
} & Partial<Omit<TCreateOrgRoleDTO, "orgId">>;

export type TDeleteOrgRoleDTO = {
  orgId: string;
  id: string;
};
