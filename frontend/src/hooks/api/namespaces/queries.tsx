import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetNamespaceDTO, TListNamespacesDTO, TNamespace, TSearchNamespacesDTO } from "./types";

export const namespacesQueryKeys = {
  allKey: () => ["namespaces"],
  listKey: (params?: TListNamespacesDTO) => [...namespacesQueryKeys.allKey(), "list", params],
  searchKey: (params?: TSearchNamespacesDTO) => [...namespacesQueryKeys.allKey(), "search", params],
  detailKey: (namepaceId: string) => [...namespacesQueryKeys.allKey(), "detail", namepaceId],
  list: (params?: TListNamespacesDTO) =>
    queryOptions({
      queryKey: namespacesQueryKeys.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ namespaces: TNamespace[]; totalCount: number }>(
          "/api/v1/namespaces",
          {
            params
          }
        );
        return data;
      }
    }),
  search: (params?: TSearchNamespacesDTO) =>
    queryOptions({
      queryKey: namespacesQueryKeys.searchKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.post<{
          namespaces: Array<TNamespace & { isMember: boolean }>;
          totalCount: number;
        }>("/api/v1/namespaces/search", params);
        return data;
      }
    }),
  detail: ({ namespaceId }: TGetNamespaceDTO) =>
    queryOptions({
      queryKey: namespacesQueryKeys.detailKey(namespaceId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ namespace: TNamespace }>(
          `/api/v1/namespaces/${namespaceId}`
        );
        return data.namespace;
      }
    })
};
