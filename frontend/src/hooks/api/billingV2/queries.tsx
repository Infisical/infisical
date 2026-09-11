import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  BillingV2CatalogProduct,
  BillingV2Organization,
  BillingV2Overview,
  BillingV2UsageBreakdown
} from "./types";

export const billingV2Keys = {
  overview: (orgId: string) => [{ orgId }, "billing-v2-overview"] as const,
  catalog: (orgId: string) => [{ orgId }, "billing-v2-catalog"] as const,
  usageBreakdown: (orgId: string, dimensionKey: string) =>
    [{ orgId, dimensionKey }, "billing-v2-usage-breakdown"] as const,
  organizations: (orgId: string) => [{ orgId }, "billing-v2-organizations"] as const
};

export const useGetBillingV2Overview = (orgId: string) => {
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
    enabled: Boolean(orgId)
  });
};

export const useGetBillingV2Catalog = (orgId: string) => {
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
    enabled: Boolean(orgId)
  });
};

// Counted live rather than served from the billing snapshot, so it stays behind the sheet that opens it
// rather than loading with the page: the identity dimensions count over the whole org tree.
export const useGetBillingV2UsageBreakdown = (orgId: string, dimensionKey: string | null) => {
  return useQuery({
    queryKey: billingV2Keys.usageBreakdown(orgId, dimensionKey ?? ""),
    queryFn: async () => {
      const {
        data: { breakdown }
      } = await apiRequest.get<{ breakdown: BillingV2UsageBreakdown }>(
        `/api/v1/organizations/${orgId}/billing/v2/usage/${dimensionKey}/breakdown`
      );

      return breakdown;
    },
    enabled: Boolean(orgId) && Boolean(dimensionKey)
  });
};

// Which organizations the billing page may be pointed at. The server decides: an instance admin on
// self-hosted gets every root org, everyone else gets only their own. Keeping that decision server-side
// means the client never has to know who is an instance admin.
export const useGetBillingV2Organizations = (orgId: string) => {
  return useQuery({
    queryKey: billingV2Keys.organizations(orgId),
    queryFn: async () => {
      const {
        data: { organizations }
      } = await apiRequest.get<{ organizations: BillingV2Organization[] }>(
        `/api/v1/organizations/${orgId}/billing/v2/organizations`
      );

      return organizations;
    },
    enabled: Boolean(orgId)
  });
};
