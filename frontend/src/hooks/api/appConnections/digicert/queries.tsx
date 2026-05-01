import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TDigiCertOrganization, TDigiCertProduct } from "./types";

const digicertConnectionKeys = {
  all: [...appConnectionKeys.all, "digicert"] as const,
  listOrganizations: (connectionId: string) =>
    [...digicertConnectionKeys.all, "organizations", connectionId] as const,
  listProducts: (connectionId: string) =>
    [...digicertConnectionKeys.all, "products", connectionId] as const
};

export const useDigiCertConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDigiCertOrganization[],
      unknown,
      TDigiCertOrganization[],
      ReturnType<typeof digicertConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: digicertConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDigiCertOrganization[]>(
        `/api/v1/app-connections/digicert/${connectionId}/organizations`
      );
      return data;
    },
    ...options
  });
};

export const useDigiCertConnectionListProducts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDigiCertProduct[],
      unknown,
      TDigiCertProduct[],
      ReturnType<typeof digicertConnectionKeys.listProducts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: digicertConnectionKeys.listProducts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDigiCertProduct[]>(
        `/api/v1/app-connections/digicert/${connectionId}/products`
      );
      return data;
    },
    ...options
  });
};
