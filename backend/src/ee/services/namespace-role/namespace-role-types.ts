import { TNamespaceRolesInsert, TNamespaceRolesUpdate } from "@app/db/schemas";
import { TNamespacePermission } from "@app/lib/types";

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
