import { useCallback } from "react";
import { useRouterState } from "@tanstack/react-router";

import {
  BillingProduct,
  buildUpgradeReturnPath
} from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";
import { useResolveV4Href } from "../../resolveV4Href";

export const useAgentVaultFreeUsage = (orgId: string, paywallKey: string, enabled = true) => {
  const mode = useV4Mode();
  const resolve = useResolveV4Href();
  const { organization } = useV4Session();
  const { data: access } = useV4Adapter("agentVaultSettings").useAccess(orgId, enabled);
  const { data: orgPermission } = useV4Adapter("access").useOrgPermission({ orgId });
  const { data: subscription } = useV4Adapter("shell").useSubscription(orgId);
  const route = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? "unknown"
  });
  const isRootOrganization = !organization.isSubOrganization;
  const permission = orgPermission?.permission;
  const canAddPaymentMethod =
    isRootOrganization &&
    Boolean(permission?.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing)) &&
    Boolean(
      permission?.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing)
    );
  const plan = subscription?.slug ?? "free";

  const trackPaywall = useCallback(
    (
      event: typeof AnalyticsEvent.PaywallViewed | typeof AnalyticsEvent.PaywallUpgradeClicked,
      paywallText: string
    ) => {
      if (mode === "demo") return;
      analytics.captureForOrganization(event, orgId, {
        paywallKey,
        paywallText,
        route,
        isEnterpriseFeature: false,
        plan
      });
    },
    [mode, orgId, paywallKey, route, plan]
  );

  const openAddPaymentMethod = (paywallText: string) => {
    trackPaywall(AnalyticsEvent.PaywallUpgradeClicked, paywallText);
    const search = new URLSearchParams({
      upgradeProduct: BillingProduct.AgentVault,
      upgradeReturnPath: buildUpgradeReturnPath(window.location)
    });
    window.location.assign(resolve(orgHref(orgId, `/billing?${search.toString()}`)));
  };

  return {
    freeUsage: enabled ? (access?.freeUsage ?? null) : null,
    isLimitReached: access?.state === "limit-reached",
    warn: Boolean(access?.warn),
    canAddPaymentMethod,
    isRootOrganization,
    openAddPaymentMethod,
    trackPaywall
  };
};
