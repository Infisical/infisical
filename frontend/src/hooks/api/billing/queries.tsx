import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingOrganizationsPage,
  BillingOverview,
  BillingUsageBreakdown
} from "./types";

type BillingOrganizationsParams = { search?: string; limit?: number; offset?: number };

export const billingKeys = {
  overview: (orgId: string) => [{ orgId }, "billing-overview"] as const,
  catalog: (orgId: string) => [{ orgId }, "billing-catalog"] as const,
  usageBreakdown: (orgId: string, dimensionKey: string, scope: BillingBreakdownScopeKind) =>
    [{ orgId, dimensionKey, scope }, "billing-usage-breakdown"] as const,
  organizations: (orgId: string, { search, ...rest }: BillingOrganizationsParams) =>
    [{ orgId, search: search || undefined, ...rest }, "billing-organizations"] as const
};

export const useGetBillingOverview = (
  orgId: string,
  options?: { enabled?: boolean; staleTime?: number }
) => {
  return useQuery({
    queryKey: billingKeys.overview(orgId),
    queryFn: async () => {
      const {
        data: { overview }
      } = await apiRequest.get<{ overview: BillingOverview }>(
        `/api/v1/organizations/${orgId}/billing/v2/overview`
      );

      return overview;
    },
    enabled: Boolean(orgId) && (options?.enabled ?? true),
    ...(options?.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: "always"
  });
};

export const useGetBillingCatalog = (orgId: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: billingKeys.catalog(orgId),
    queryFn: async () => {
      const {
        data: { products }
      } = await apiRequest.get<{ products: BillingCatalogProduct[] }>(
        `/api/v1/organizations/${orgId}/billing/v2/catalog`
      );

      return products;
    },
    enabled: Boolean(orgId) && (options?.enabled ?? true),
    placeholderData: keepPreviousData
  });
};

export const useGetBillingUsageBreakdown = (
  orgId: string,
  dimensionKey: string | null,
  scope: BillingBreakdownScopeKind = "organization"
) => {
  return useQuery({
    queryKey: billingKeys.usageBreakdown(orgId, dimensionKey ?? "", scope),
    queryFn: async () => {
      const {
        data: { breakdown }
      } = await apiRequest.get<{ breakdown: BillingUsageBreakdown }>(
        `/api/v1/organizations/${orgId}/billing/v2/breakdowns/${dimensionKey}`,
        { params: { scope } }
      );

      return breakdown;
    },
    enabled: Boolean(orgId) && Boolean(dimensionKey)
  });
};

// Which organizations the billing page may be pointed at. The server decides: an instance admin on
// self-hosted gets every root org, everyone else gets only their own. Keeping that decision server-side
// means the client never has to know who is an instance admin.
export const useGetBillingOrganizations = (
  orgId: string,
  { search, limit = 100, offset = 0 }: BillingOrganizationsParams = {}
) => {
  return useQuery({
    queryKey: billingKeys.organizations(orgId, { search, limit, offset }),
    queryFn: async () => {
      const { data } = await apiRequest.get<BillingOrganizationsPage>(
        `/api/v1/organizations/${orgId}/billing/v2/organizations`,
        { params: { search: search || undefined, limit, offset } }
      );

      return data;
    },
    enabled: Boolean(orgId),
    // Searching replaces the query key, so without this the popup empties on every keystroke and the
    // list jumps. Holding the previous page keeps it readable while the next one loads.
    placeholderData: keepPreviousData
  });
};
