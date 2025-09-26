import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetNamespaceDTO, TListNamespacesDTO, TNamespace, TSearchNamespacesDTO } from "./types";

export const namespacesQueryKeys = {
  allKey: () => ["namespaces"],
  listKey: (params?: TListNamespacesDTO) => [...namespacesQueryKeys.allKey(), "list", params],
  searchKey: (params?: TSearchNamespacesDTO) => [...namespacesQueryKeys.allKey(), "search", params],
  detailKey: (name: string) => [...namespacesQueryKeys.allKey(), "detail", name],
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
  detail: ({ name }: TGetNamespaceDTO) =>
    queryOptions({
      queryKey: namespacesQueryKeys.detailKey(name),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ namespace: TNamespace }>(
          `/api/v1/namespaces/${name}`
        );
        return data.namespace;
      }
    })
};
