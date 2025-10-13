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
  namespaceId: string;
  name: string;
  slug: string;
  description?: string;
  permissions: TNamespacePermission[];
};

export type TUpdateNamespaceRoleDTO = {
  namespaceId: string;
  roleId: string;
  name?: string;
  slug?: string;
  description?: string;
  permissions?: TNamespacePermission[];
};

export type TDeleteNamespaceRoleDTO = {
  namespaceId: string;
  roleId: string;
};

export type TListNamespaceRolesDTO = {
  namespaceId: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TGetNamespaceRoleBySlugDTO = {
  namespaceId: string;
  roleSlug: string;
};

export type TGetNamespaceUserPermissionsDTO = {
  namespaceId: string;
};

export type TNamespaceUserPermissions = {
  memberships: {
    id: string;
    roles: Array<{
      role: string;
    }>;
  }[];
  permissions: any[];
};
