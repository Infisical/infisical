import { isAxiosError } from "axios";

import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useServerConfig,
  useSubscription
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useGetBillingV2Catalog, useGetBillingV2Overview } from "@app/hooks/api";

import { resolveUpgradeOffer } from "./resolve-upgrade-offer";
import type { UpgradeFeatureKey } from "./upgrade-feature-registry";

type UseUpgradeOfferProps = {
  featureKey?: UpgradeFeatureKey;
  isEnterpriseFeature: boolean;
  isOpen: boolean;
};

export const useUpgradeOffer = ({
  featureKey,
  isEnterpriseFeature,
  isOpen
}: UseUpgradeOfferProps) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const { config } = useServerConfig();
  const { subscription } = useSubscription();
  const billingOrgId = currentOrg.rootOrgId ?? currentOrg.id;

  const canManageCurrentOrgBilling =
    permission.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing) &&
    permission.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);
  const isLicenseV2 = Boolean(config.licenseServerV2Enabled);
  const shouldLoadBillingV2 =
    isOpen && isLicenseV2 && (isSubOrganization || canManageCurrentOrgBilling);
  const overview = useGetBillingV2Overview(billingOrgId, shouldLoadBillingV2);
  const catalog = useGetBillingV2Catalog(billingOrgId, shouldLoadBillingV2);
  const isRootBillingForbidden =
    isAxiosError(overview.error) && overview.error.response?.status === 403;
  const canManageBilling = isSubOrganization
    ? (overview.data?.canManageBilling ?? !isRootBillingForbidden)
    : canManageCurrentOrgBilling;

  return resolveUpgradeOffer({
    canManageBilling,
    checkoutError: overview.isError || catalog.isError,
    featureKey,
    hasUsedLegacyTrial: subscription.has_used_trial,
    isCloud: isInfisicalCloud(),
    isEnterpriseFeature,
    isLoading: shouldLoadBillingV2 && (overview.isPending || catalog.isPending),
    isLicenseV2,
    overview: overview.data,
    catalog: catalog.data
  });
};
