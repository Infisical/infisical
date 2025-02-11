import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TDatabricksConnectionListSecretScopesResponse, TDatabricksSecretScope } from "./types";

const databricksConnectionKeys = {
  all: [...appConnectionKeys.all, "databricks"] as const,
  listSecretScopes: (connectionId: string) =>
    [...databricksConnectionKeys.all, "workspace-scopes", connectionId] as const
};

export const useDatabricksConnectionListSecretScopes = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDatabricksSecretScope[],
      unknown,
      TDatabricksSecretScope[],
      ReturnType<typeof databricksConnectionKeys.listSecretScopes>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: databricksConnectionKeys.listSecretScopes(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDatabricksConnectionListSecretScopesResponse>(
        `/api/v1/app-connections/databricks/${connectionId}/secret-scopes`
      );

      return data.secretScopes;
    },
    ...options
  });
};
