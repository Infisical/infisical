import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TVercelConnectionOrganization } from "./types";

const vercelConnectionKeys = {
  all: [...appConnectionKeys.all, "vercel"] as const,
  listOrganizations: (connectionId: string, projectSearch?: string) =>
    [...vercelConnectionKeys.all, "organizations", connectionId, { projectSearch }] as const
};

export const useVercelConnectionListOrganizations = (
  connectionId: string,
  projectSearch?: string,
  options?: Omit<
    UseQueryOptions<
      TVercelConnectionOrganization[],
      unknown,
      TVercelConnectionOrganization[],
      ReturnType<typeof vercelConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: vercelConnectionKeys.listOrganizations(connectionId, projectSearch),
    queryFn: async () => {
      const { data } = await apiRequest.get<TVercelConnectionOrganization[]>(
        `/api/v1/app-connections/vercel/${connectionId}/projects`,
        {
          params: {
            projectSearch
          }
        }
      );

      return data;
    },
    ...options
  });
};
