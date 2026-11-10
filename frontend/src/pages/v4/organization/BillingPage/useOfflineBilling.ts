import type { BillingBreakdownScopeKind } from "@app/hooks/api/billing/types";
import { BillingBreakdownDimension } from "@app/hooks/api/billing/types";

import { useOrgId } from "../../access/permissions";
import { useV4Adapter } from "../../data/adapters";
import {
  buildOfflineBilling,
  type OfflineDimensionUsage,
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
  const billing = useV4Adapter("billing");
  const { data: subscription } = billing.useSubscription(useOrgId());
  const wanted = new Set<string>(
    enabled && subscription ? offlineQueryDimensions(subscription) : []
  );
  const keyFor = (key: BillingBreakdownDimension) => (wanted.has(key) ? key : null);
  const D = BillingBreakdownDimension;

  const queries = {
    [D.Identities]: billing.useUsageBreakdown(orgId, keyFor(D.Identities), scope),
    [D.UserIdentities]: billing.useUsageBreakdown(orgId, keyFor(D.UserIdentities), scope),
    [D.SecretIdentities]: billing.useUsageBreakdown(orgId, keyFor(D.SecretIdentities), scope),
    [D.PamIdentities]: billing.useUsageBreakdown(orgId, keyFor(D.PamIdentities), scope),
    [D.InternalCas]: billing.useUsageBreakdown(orgId, keyFor(D.InternalCas), scope),
    [D.ActiveCerts]: billing.useUsageBreakdown(orgId, keyFor(D.ActiveCerts), scope),
    [D.WildcardCerts]: billing.useUsageBreakdown(orgId, keyFor(D.WildcardCerts), scope)
  };
  const active = Object.values(D)
    .filter((key) => wanted.has(key))
    .map((key) => ({ key, query: queries[key] }));

  const isPending = !enabled || !subscription || active.some(({ query }) => query.isPending);
  const failed = active.filter(({ query }) => query.isError);
  const usage: Partial<Record<BillingBreakdownDimension, OfflineDimensionUsage>> = {};
  active.forEach(({ key, query }) => {
    if (query.data) usage[key] = { total: query.data.total, unit: query.data.unit };
  });
  const built =
    isPending || failed.length > 0 || !subscription
      ? null
      : buildOfflineBilling(subscription, usage);

  return {
    overview: built?.overview,
    catalog: built?.catalog ?? [],
    isPending,
    isError: failed.length > 0,
    refetch: () => Promise.all(failed.map(({ query }) => query.refetch()))
  };
};
