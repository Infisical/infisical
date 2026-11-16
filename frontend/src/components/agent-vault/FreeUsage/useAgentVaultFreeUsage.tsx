import { useCallback } from "react";
import { useRouterState } from "@tanstack/react-router";

import { BillingProduct, buildUpgradeReturnPath } from "@app/components/license/UpgradeGate";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription
} from "@app/context";
import { useGetAgentVaultAccess } from "@app/hooks/api/agentVault";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

// freeUsage is the org's free Agent Vault requests this month, and null unless the org is on the free tier.
export const useAgentVaultFreeUsage = (paywallKey: string) => {
  const { data: access } = useGetAgentVaultAccess();
  const { currentOrg, isRootOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const { subscription } = useSubscription();
  const route = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? "unknown"
  });
  const canAddCard =
    isRootOrganization &&
    permission.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing) &&
    permission.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);
  const plan = subscription.slug ?? "free";

  const trackPaywall = useCallback(
    (
      event: typeof AnalyticsEvent.PaywallViewed | typeof AnalyticsEvent.PaywallUpgradeClicked,
      paywallText: string
    ) =>
      analytics.captureForOrganization(event, currentOrg.id, {
        paywallKey,
        paywallText,
        route,
        isEnterpriseFeature: false,
        plan
      }),
    [currentOrg.id, paywallKey, route, plan]
  );

  const openAddCard = useCallback(
    (paywallText: string) => {
      trackPaywall(AnalyticsEvent.PaywallUpgradeClicked, paywallText);
      const search = new URLSearchParams({
        upgradeProduct: BillingProduct.AgentVault,
        upgradeReturnPath: buildUpgradeReturnPath(window.location)
      });
      window.location.assign(`/organizations/${currentOrg.id}/billing?${search.toString()}`);
    },
    [trackPaywall, currentOrg.id]
  );

  return {
    freeUsage: access?.freeUsage ?? null,
    isLimitReached: access?.state === "limit-reached",
    warn: Boolean(access?.warn),
    canAddCard,
    isRootOrganization,
    openAddCard,
    trackPaywall
  };
};
