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
    params.namespaceId,
    params
  ],
  detailKey: (namespaceId: string, roleSlug: string) => [
    ...namespaceRolesQueryKeys.allKey(),
    "detail",
    namespaceId,
    roleSlug
  ],
  permissionsKey: (namespaceId: string) => [
    ...namespaceRolesQueryKeys.allKey(),
    "permissions",
    namespaceId
  ],
  list: ({ namespaceId, ...params }: TListNamespaceRolesDTO) =>
    queryOptions({
      queryKey: namespaceRolesQueryKeys.listKey({ namespaceId, ...params }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ roles: TNamespaceRole[]; totalCount: number }>(
          `/api/v1/namespaces/${namespaceId}/roles`,
          {
            params
          }
        );
        return data;
      }
    }),
  detail: ({ namespaceId, roleSlug }: TGetNamespaceRoleBySlugDTO) =>
    queryOptions({
      queryKey: namespaceRolesQueryKeys.detailKey(namespaceId, roleSlug),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ role: TNamespaceRole }>(
          `/api/v1/namespaces/${namespaceId}/roles/slug/${roleSlug}`
        );
        return data.role;
      }
    }),
  getUserPermissions: ({ namespaceId }: TGetNamespaceUserPermissionsDTO) =>
    queryOptions({
      queryKey: namespaceRolesQueryKeys.permissionsKey(namespaceId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ data: TNamespaceUserPermissions }>(
          `/api/v1/namespaces/${namespaceId}/permissions`
        );
        return data.data;
      }
    })
};
