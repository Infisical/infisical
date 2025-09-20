export type TNamespaceRole = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  permissions?: any[];
  createdAt: string;
  updatedAt: string;
};

export type TNamespacePermission = {
  action: string;
  subject: string;
  conditions?: Record<string, any>;
};

export type TCreateNamespaceRoleDTO = {
  namespaceName: string;
  name: string;
  slug: string;
  description?: string;
  permissions: TNamespacePermission[];
};

export type TUpdateNamespaceRoleDTO = {
  namespaceName: string;
  roleId: string;
  name?: string;
  slug?: string;
  description?: string;
  permissions?: TNamespacePermission[];
};

export type TDeleteNamespaceRoleDTO = {
  namespaceName: string;
  roleId: string;
};

export type TListNamespaceRolesDTO = {
  namespaceName: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TGetNamespaceRoleBySlugDTO = {
  namespaceName: string;
  roleSlug: string;
};

export type TGetNamespaceUserPermissionsDTO = {
  namespaceName: string;
};

export type TNamespaceUserPermissions = {
  membership: {
    id: string;
    roles: Array<{
      role: string;
    }>;
  };
  permissions: any[];
};