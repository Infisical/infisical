import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TDatabricksConnectionListSecretScopesResponse,
  TDatabricksConnectionListServicePrincipalsResponse,
  TDatabricksSecretScope,
  TDatabricksServicePrincipal
} from "./types";

const databricksConnectionKeys = {
  all: [...appConnectionKeys.all, "databricks"] as const,
  listSecretScopes: (connectionId: string) =>
    [...databricksConnectionKeys.all, "workspace-scopes", connectionId] as const,
  listServicePrincipals: (connectionId: string) =>
    [...databricksConnectionKeys.all, "service-principals", connectionId] as const
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
        `/api/v1/app-connections/databricks/${connectionId}/secret-scopes`,
        {}
      );

      return data.secretScopes;
    },
    ...options
  });
};

export const useDatabricksConnectionListServicePrincipals = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDatabricksServicePrincipal[],
      unknown,
      TDatabricksServicePrincipal[],
      ReturnType<typeof databricksConnectionKeys.listServicePrincipals>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: databricksConnectionKeys.listServicePrincipals(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDatabricksConnectionListServicePrincipalsResponse>(
        `/api/v1/app-connections/databricks/${connectionId}/service-principals`,
        {}
      );

      return data.servicePrincipals;
    },
    ...options
  });
};
