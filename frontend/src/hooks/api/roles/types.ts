export type TGetRolesDTO = {
  orgId: string;
  workspaceId?: string;
};

export type TRole<T extends string | undefined> = {
  _id: string;
  organization: string;
  workspace: T;
  name: string;
  description: string;
  slug: string;
  permissions: T extends string ? TProjectPermission[] : TPermission[];
  createdAt: string;
  updatedAt: string;
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
