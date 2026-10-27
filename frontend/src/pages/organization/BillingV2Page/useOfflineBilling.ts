import { useSubscription } from "@app/context";
import {
  BillingV2BreakdownDimension,
  BillingV2BreakdownScopeKind,
  useGetBillingV2UsageBreakdown
} from "@app/hooks/api";

import {
  buildOfflineBilling,
  OfflineDimensionUsage,
  offlineQueryDimensions
} from "./billing-v2-offline-usage";

export const useOfflineBilling = ({
  orgId,
  scope,
  enabled
}: {
  orgId: string;
  scope: BillingV2BreakdownScopeKind;
  enabled: boolean;
}) => {
  const { subscription } = useSubscription();
  const wanted = new Set<string>(enabled ? offlineQueryDimensions(subscription) : []);
  const keyFor = (key: BillingV2BreakdownDimension) => (wanted.has(key) ? key : null);
  const D = BillingV2BreakdownDimension;

  const queries = {
    [D.Identities]: useGetBillingV2UsageBreakdown(orgId, keyFor(D.Identities), scope),
    [D.UserIdentities]: useGetBillingV2UsageBreakdown(orgId, keyFor(D.UserIdentities), scope),
    [D.SecretIdentities]: useGetBillingV2UsageBreakdown(orgId, keyFor(D.SecretIdentities), scope),
    [D.PamIdentities]: useGetBillingV2UsageBreakdown(orgId, keyFor(D.PamIdentities), scope),
    [D.InternalCas]: useGetBillingV2UsageBreakdown(orgId, keyFor(D.InternalCas), scope),
    [D.ActiveCerts]: useGetBillingV2UsageBreakdown(orgId, keyFor(D.ActiveCerts), scope),
    [D.WildcardCerts]: useGetBillingV2UsageBreakdown(orgId, keyFor(D.WildcardCerts), scope)
  };
  const active = Object.values(D)
    .filter((key) => wanted.has(key))
    .map((key) => ({ key, query: queries[key] }));

  const isPending = !enabled || active.some(({ query }) => query.isPending);
  const failed = active.filter(({ query }) => query.isError);
  const usage: Partial<Record<BillingV2BreakdownDimension, OfflineDimensionUsage>> = {};
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
