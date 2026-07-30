import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { BillingV2CatalogProduct, BillingV2Overview } from "./types";

export const billingV2Keys = {
  overview: (orgId: string) => [{ orgId }, "billing-v2-overview"] as const,
  catalog: (orgId: string) => [{ orgId }, "billing-v2-catalog"] as const
};

export const useGetBillingV2Overview = (orgId: string, enabled = true) => {
  return useQuery({
    queryKey: billingV2Keys.overview(orgId),
    queryFn: async () => {
      const {
        data: { overview }
      } = await apiRequest.get<{ overview: BillingV2Overview }>(
        `/api/v1/organizations/${orgId}/billing/v2/overview`
      );

      return overview;
    },
    enabled: Boolean(orgId) && enabled
  });
};

export const useGetBillingV2Catalog = (orgId: string, enabled = true) => {
  return useQuery({
    queryKey: billingV2Keys.catalog(orgId),
    queryFn: async () => {
      const {
        data: { products }
      } = await apiRequest.get<{ products: BillingV2CatalogProduct[] }>(
        `/api/v1/organizations/${orgId}/billing/v2/catalog`
      );

      return products;
    },
    enabled: Boolean(orgId) && enabled
  });
};
