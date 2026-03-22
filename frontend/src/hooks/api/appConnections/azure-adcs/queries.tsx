import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";

const azureAdcsConnectionKeys = {
  all: [...appConnectionKeys.all, "azure-adcs"] as const,
  listTemplates: (connectionId: string) =>
    [...azureAdcsConnectionKeys.all, "templates", connectionId] as const
};

export const useAzureAdcsConnectionListTemplates = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      string[],
      unknown,
      string[],
      ReturnType<typeof azureAdcsConnectionKeys.listTemplates>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: azureAdcsConnectionKeys.listTemplates(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ templates: string[] }>(
        `/api/v1/app-connections/azure-adcs/${connectionId}/adcs-templates`
      );

      return data.templates;
    },
    ...options
  });
};
