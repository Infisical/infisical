import type { BillingV2CatalogProduct, BillingV2Overview } from "@app/hooks/api";

import type { UpgradeFeatureKey } from "./upgrade-feature-registry";

export type UpgradeOfferKind =
  | "ask-admin"
  | "contact-sales"
  | "loading"
  | "start-trial"
  | "temporarily-unavailable"
  | "view-plans";

export type UpgradeOffer = {
  kind: UpgradeOfferKind;
  primaryLabel?: string;
  productId?: string;
  reason?: "trial-used";
};

type ResolveUpgradeOfferInput = {
  canManageBilling: boolean;
  checkoutError: boolean;
  featureKey?: UpgradeFeatureKey;
  hasUsedLegacyTrial: boolean;
  isCloud: boolean;
  isEnterpriseFeature: boolean;
  isLoading: boolean;
  isLicenseV2: boolean;
  overview?: BillingV2Overview;
  catalog?: BillingV2CatalogProduct[];
};

export const resolveUpgradeOffer = ({
  canManageBilling,
  checkoutError,
  featureKey,
  hasUsedLegacyTrial,
  isCloud,
  isEnterpriseFeature,
  isLoading,
  isLicenseV2,
  overview,
  catalog = []
}: ResolveUpgradeOfferInput): UpgradeOffer => {
  if (!canManageBilling) {
    return { kind: "ask-admin" };
  }

  if (!isCloud) {
    return { kind: "contact-sales", primaryLabel: "Contact sales" };
  }

  if (!isLicenseV2) {
    if (isEnterpriseFeature) {
      return { kind: "contact-sales", primaryLabel: "Contact sales" };
    }

    return hasUsedLegacyTrial
      ? { kind: "view-plans", primaryLabel: "View plans", reason: "trial-used" }
      : { kind: "start-trial", primaryLabel: "Start a Free 2-week trial" };
  }

  if (isLoading) {
    return { kind: "loading" };
  }

  if (checkoutError || !overview) {
    return { kind: "view-plans", primaryLabel: "View plans" };
  }

  if (overview.checkoutFrozen) {
    return { kind: "temporarily-unavailable" };
  }

  const productId = featureKey
    ? (overview.featureProductMap[featureKey] ??
      catalog.find((candidate) => candidate.plans.some((plan) => plan.feature === featureKey))?.id)
    : undefined;
  const product = catalog.find((candidate) => candidate.id === productId);

  if (!product) {
    return isEnterpriseFeature || !overview.selfServe
      ? { kind: "contact-sales", primaryLabel: "Contact sales" }
      : { kind: "view-plans", primaryLabel: "View plans" };
  }

  if (!overview.selfServe) {
    return { kind: "contact-sales", primaryLabel: "Contact sales", productId };
  }

  const entitled = overview.entitlements[productId]?.entitled ?? false;
  const trialUsed = overview.trialedProductKeys.includes(productId);
  const trialable = product.plans.some((plan) => plan.selfServe && plan.trialable);
  const selfServe = product.plans.some((plan) => plan.selfServe);
  const salesLed = product.plans.some((plan) => plan.salesLed);

  if (!entitled && !trialUsed && trialable) {
    return {
      kind: "start-trial",
      primaryLabel: "Start a Free 2-week trial",
      productId
    };
  }

  if (!entitled && trialUsed && trialable) {
    return {
      kind: "view-plans",
      primaryLabel: "View plans",
      productId,
      reason: "trial-used"
    };
  }

  if (!entitled && selfServe) {
    return { kind: "view-plans", primaryLabel: "View plans", productId };
  }

  if (!entitled && salesLed) {
    return { kind: "contact-sales", primaryLabel: "Contact sales", productId };
  }

  return { kind: "view-plans", primaryLabel: "View plans", productId };
};
