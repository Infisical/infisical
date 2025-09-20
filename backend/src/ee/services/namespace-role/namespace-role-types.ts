import { TNamespaceRolesInsert, TNamespaceRolesUpdate } from "@app/db/schemas";
import { TNamespacePermission } from "@app/lib/types";

// TODO(namespace): add unique to role slug in name
// TODO(namespace): add unique to namespace slug in org
export type TCreateNamespaceRoleDTO = {
  data: Omit<TNamespaceRolesInsert, "namespaceId">;
  namespaceName: string;
} & Omit<TNamespacePermission, "namespaceName">;

export type TGetNamespaceRoleDetailsDTO = {
  roleName: string;
  namespaceName: string;
} & Omit<TNamespacePermission, "namespaceName">;

export type TUpdateNamespaceRoleDTO = {
  roleId: string;
  data: Omit<TNamespaceRolesUpdate, "namespaceId">;
} & Omit<TNamespacePermission, "namespaceName">;

export type TDeleteNamespaceRoleDTO = {
  roleId: string;
} & Omit<TNamespacePermission, "namespaceName">;

export type TListNamespaceRolesDTO = {
  namespaceName: string;
  limit?: number;
  offset?: number;
  search?: string;
} & Omit<TNamespacePermission, "namespaceName">;

export type TGetNamespacePredefinedRolesDTO = {
  namespace: string;
};
