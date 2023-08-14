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

export type TPermission = {
  condition?: Record<string, any>;
  action: "read" | "edit" | "create" | "delete";
  subject: string;
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
