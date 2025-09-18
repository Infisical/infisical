import { TNamespaceRolesInsert, TNamespaceRolesUpdate } from "@app/db/schemas";
import { TNamespacePermission } from "@app/lib/types";

// TODO(namespace): add unique to role slug in name
// TODO(namespace): add unique to namespace slug in org
export type TCreateNamespaceRoleDTO = {
  data: Omit<TNamespaceRolesInsert, "namespaceId">;
  namespaceName: string;
} & Omit<TNamespacePermission, "namespaceId">;

export type TGetNamespaceRoleDetailsDTO = {
  roleName: string;
  namespaceName: string;
} & Omit<TNamespacePermission, "namespaceId">;

export type TUpdateNamespaceRoleDTO = {
  roleId: string;
  data: Omit<TNamespaceRolesUpdate, "namespaceId">;
} & Omit<TNamespacePermission, "namespaceId">;

export type TDeleteNamespaceRoleDTO = {
  roleId: string;
} & Omit<TNamespacePermission, "namespaceId">;

export type TListNamespaceRolesDTO = {
  namespaceName: string;
  limit?: number;
  offset?: number;
  search?: string;
} & Omit<TNamespacePermission, "namespaceId">;

export type TGetNamespacePredefinedRolesDTO = {
  namespace: string;
};
