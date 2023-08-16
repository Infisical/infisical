export type TGetRolesDTO = {
  orgId: string;
  workspaceId?: string;
};

export type TRole = {
  _id: string;
  organization: string;
  workspace: string;
  name: string;
  description: string;
  slug: string;
  permissions: TPermission[];
  createdAt: string;
  updatedAt: string;
};

export type TPermission = TWorkspacePermission | TGeneralPermission;

type TGeneralPermission = {
  condition?: Record<string, any>;
  action: "read" | "edit" | "create" | "delete";
  subject: "member" | "role" | "incident-contact" | "sso" | "billing" | "settings";
};

type TWorkspacePermission = {
  condition?: Record<string, any>;
  action: "read" | "create";
  subject: "workspace";
};

export type TCreateRoleDTO = {
  orgId: string;
  workspaceId?: string;
  name: string;
  description?: string;
  slug: string;
  permissions: TPermission[];
};

export type TUpdateRoleDTO = {
  orgId: string;
  id: string;
  workspaceId?: string;
} & Partial<Omit<TCreateRoleDTO, "orgId" | "workspaceId">>;

export type TDeleteRoleDTO = {
  orgId: string;
  id: string;
  workspaceId?: string;
};

export type TGetUserOrgPermissionsDTO = {
  orgId: string;
};
