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

export type TPermission = TWorkspacePermission | TGeneralPermission;

type TGeneralPermission = {
  conditions?: Record<string, any>;
  action: "read" | "edit" | "create" | "delete";
  subject: "member" | "role" | "incident-contact" | "sso" | "billing" | "settings";
};

type TWorkspacePermission = {
  conditions?: Record<string, any>;
  action: "read" | "create";
  subject: "workspace";
};

export type TProjectPermission = TProjectGeneralPermission | TProjectWorkspacePermission;

type TProjectGeneralPermission = {
  conditions?: Record<string, any>;
  action: "read" | "edit" | "create" | "delete";
  subject:
    | "member"
    | "role"
    | "settings"
    | "secrets"
    | "environments"
    | "folders"
    | "secret-imports"
    | "service-tokens";
};

type TProjectWorkspacePermission = {
  conditions?: Record<string, any>;
  action: "delete" | "edit";
  subject: "workspace";
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
