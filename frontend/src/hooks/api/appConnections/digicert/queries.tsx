import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TDigiCertOrganization, TDigiCertProduct } from "./types";

const digicertConnectionKeys = {
  all: [...appConnectionKeys.all, "digicert"] as const,
  listOrganizations: (connectionId: string) =>
    [...digicertConnectionKeys.all, "organizations", connectionId] as const,
  listProducts: (connectionId: string) =>
    [...digicertConnectionKeys.all, "products", connectionId] as const,
  orgValidation: (connectionId: string, organizationId: number, productNameId: string) =>
    [
      ...digicertConnectionKeys.all,
      "org-validation",
      connectionId,
      organizationId,
      productNameId
    ] as const,
  orders: (connectionId: string, organizationId: number, productNameId: string) =>
    [...digicertConnectionKeys.all, "orders", connectionId, organizationId, productNameId] as const
};

export type TDigiCertOrder = {
  orderId: number;
  commonName: string;
  organizationName: string;
  status: string;
  validTill?: string;
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

export const useDigiCertConnectionOrgValidation = (
  connectionId: string,
  organizationId: number,
  productNameId: string,
  options?: Omit<
    UseQueryOptions<
      { isValidated: boolean },
      unknown,
      { isValidated: boolean },
      ReturnType<typeof digicertConnectionKeys.orgValidation>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: digicertConnectionKeys.orgValidation(connectionId, organizationId, productNameId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ isValidated: boolean }>(
        `/api/v1/app-connections/digicert/${connectionId}/organizations/${organizationId}/validation`,
        { params: { productNameId } }
      );
      return data;
    },
    ...options
  });
};

export const useDigiCertConnectionListOrders = (
  connectionId: string,
  organizationId: number,
  productNameId: string,
  options?: Omit<
    UseQueryOptions<
      TDigiCertOrder[],
      unknown,
      TDigiCertOrder[],
      ReturnType<typeof digicertConnectionKeys.orders>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: digicertConnectionKeys.orders(connectionId, organizationId, productNameId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDigiCertOrder[]>(
        `/api/v1/app-connections/digicert/${connectionId}/organizations/${organizationId}/orders`,
        { params: { productNameId } }
      );
      return data;
    },
    ...options
  });
};
