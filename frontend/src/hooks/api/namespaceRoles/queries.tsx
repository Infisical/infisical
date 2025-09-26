import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetNamespaceRoleBySlugDTO,
  TGetNamespaceUserPermissionsDTO,
  TListNamespaceRolesDTO,
  TNamespaceRole,
  TNamespaceUserPermissions
} from "./types";

export const namespaceRolesQueryKeys = {
  allKey: () => ["namespace-roles"],
  listKey: (params: TListNamespaceRolesDTO) => [
    ...namespaceRolesQueryKeys.allKey(),
    "list",
    params.namespaceName,
    params
  ],
  detailKey: (namespaceName: string, roleSlug: string) => [
    ...namespaceRolesQueryKeys.allKey(),
    "detail",
    namespaceName,
    roleSlug
  ],
  permissionsKey: (namespaceName: string) => [
    ...namespaceRolesQueryKeys.allKey(),
    "permissions",
    namespaceName
  ],
  list: ({ namespaceName, ...params }: TListNamespaceRolesDTO) =>
    queryOptions({
      queryKey: namespaceRolesQueryKeys.listKey({ namespaceName, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ roles: TNamespaceRole[]; totalCount: number }>(
          `/api/v1/namespaces/${namespaceName}/roles`,
          {
            params
          }
        );
        return data;
      }
    }),
  detail: ({ namespaceName, roleSlug }: TGetNamespaceRoleBySlugDTO) =>
    queryOptions({
      queryKey: namespaceRolesQueryKeys.detailKey(namespaceName, roleSlug),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ role: TNamespaceRole }>(
          `/api/v1/namespaces/${namespaceName}/roles/slug/${roleSlug}`
        );
        return data.role;
      }
    }),
  getUserPermissions: ({ namespaceName }: TGetNamespaceUserPermissionsDTO) =>
    queryOptions({
      queryKey: namespaceRolesQueryKeys.permissionsKey(namespaceName),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ data: TNamespaceUserPermissions }>(
          `/api/v1/namespaces/${namespaceName}/permissions`
        );
        return data.data;
      }
    })
};
