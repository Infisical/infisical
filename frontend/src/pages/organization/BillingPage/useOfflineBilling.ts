import { useSubscription } from "@app/context";
import {
  BillingBreakdownDimension,
  BillingBreakdownScopeKind,
  useGetBillingUsageBreakdown
} from "@app/hooks/api";

import {
  buildOfflineBilling,
  OfflineDimensionUsage,
  offlineQueryDimensions
} from "./billing-offline-usage";

export const useOfflineBilling = ({
  orgId,
  scope,
  enabled
}: {
  orgId: string;
  scope: BillingBreakdownScopeKind;
  enabled: boolean;
}) => {
  const { subscription } = useSubscription();
  const wanted = new Set<string>(enabled ? offlineQueryDimensions(subscription) : []);
  const keyFor = (key: BillingBreakdownDimension) => (wanted.has(key) ? key : null);
  const D = BillingBreakdownDimension;

  const queries = {
    [D.Identities]: useGetBillingUsageBreakdown(orgId, keyFor(D.Identities), scope),
    [D.UserIdentities]: useGetBillingUsageBreakdown(orgId, keyFor(D.UserIdentities), scope),
    [D.SecretIdentities]: useGetBillingUsageBreakdown(orgId, keyFor(D.SecretIdentities), scope),
    [D.PamIdentities]: useGetBillingUsageBreakdown(orgId, keyFor(D.PamIdentities), scope),
    [D.InternalCas]: useGetBillingUsageBreakdown(orgId, keyFor(D.InternalCas), scope),
    [D.ActiveCerts]: useGetBillingUsageBreakdown(orgId, keyFor(D.ActiveCerts), scope),
    [D.WildcardCerts]: useGetBillingUsageBreakdown(orgId, keyFor(D.WildcardCerts), scope)
  };
  const active = Object.values(D)
    .filter((key) => wanted.has(key))
    .map((key) => ({ key, query: queries[key] }));

  const isPending = !enabled || active.some(({ query }) => query.isPending);
  const failed = active.filter(({ query }) => query.isError);
  const usage: Partial<Record<BillingBreakdownDimension, OfflineDimensionUsage>> = {};
  active.forEach(({ key, query }) => {
    if (query.data) usage[key] = { total: query.data.total, unit: query.data.unit };
  });
  const built = isPending || failed.length > 0 ? null : buildOfflineBilling(subscription, usage);

  return {
    overview: built?.overview,
    catalog: built?.catalog ?? [],
    isPending,
    isError: failed.length > 0,
    refetch: () => Promise.all(failed.map(({ query }) => query.refetch()))
  };
};
