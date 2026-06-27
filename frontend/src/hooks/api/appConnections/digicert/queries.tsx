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
  codeSigningValidation: (connectionId: string, organizationId: number, productNameId: string) =>
    [
      ...digicertConnectionKeys.all,
      "code-signing-validation",
      connectionId,
      organizationId,
      productNameId
    ] as const,
  codeSigningOrders: (connectionId: string, organizationId: number, productNameId: string) =>
    [
      ...digicertConnectionKeys.all,
      "code-signing-orders",
      connectionId,
      organizationId,
      productNameId
    ] as const
};

export type TDigiCertCodeSigningOrder = {
  orderId: number;
  commonName: string;
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

export const useDigiCertConnectionCodeSigningValidation = (
  connectionId: string,
  organizationId: number,
  productNameId: string,
  options?: Omit<
    UseQueryOptions<
      { isValidated: boolean },
      unknown,
      { isValidated: boolean },
      ReturnType<typeof digicertConnectionKeys.codeSigningValidation>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: digicertConnectionKeys.codeSigningValidation(
      connectionId,
      organizationId,
      productNameId
    ),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ isValidated: boolean }>(
        `/api/v1/app-connections/digicert/${connectionId}/organizations/${organizationId}/code-signing-validation`,
        { params: { productNameId } }
      );
      return data;
    },
    ...options
  });
};

export const useDigiCertConnectionListCodeSigningOrders = (
  connectionId: string,
  organizationId: number,
  productNameId: string,
  options?: Omit<
    UseQueryOptions<
      TDigiCertCodeSigningOrder[],
      unknown,
      TDigiCertCodeSigningOrder[],
      ReturnType<typeof digicertConnectionKeys.codeSigningOrders>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: digicertConnectionKeys.codeSigningOrders(connectionId, organizationId, productNameId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDigiCertCodeSigningOrder[]>(
        `/api/v1/app-connections/digicert/${connectionId}/organizations/${organizationId}/code-signing-orders`,
        { params: { productNameId } }
      );
      return data;
    },
    ...options
  });
};
