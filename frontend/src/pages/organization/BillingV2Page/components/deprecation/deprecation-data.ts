import { BillingV2Entitlement } from "@app/hooks/api";

import { tierLabel } from "../../billing-v2-format";

export type Deprecation = NonNullable<BillingV2Entitlement["deprecation"]>;

export type DeprecatedEntry = {
  productId: string;
  name: string;
  planTier?: string;
  deprecation: Deprecation;
};

export const daysLeftLabel = (daysLeft: number | null): string | null => {
  if (daysLeft === null) {
    return null;
  }
  return `${daysLeft.toLocaleString()} ${daysLeft === 1 ? "day" : "days"} left`;
};

// Concise, single-line deprecation summary for the product row. The full reason/nextSteps live in the
// top banner + its "See what changes" dialog, so this stays short and truncates rather than wrapping.
export const deprecationSubline = (deprecation: Deprecation, planTier?: string): string => {
  if (deprecation.kind === "product") {
    return deprecation.date ? `Discontinued — access ends ${deprecation.date}` : "Discontinued";
  }
  const tier = planTier ? tierLabel(planTier) : "This plan";
  const base = deprecation.date
    ? `${tier} plan retires ${deprecation.date}`
    : `${tier} plan is retiring`;
  return deprecation.nextSteps ? `${base} · ${deprecation.nextSteps}` : base;
};
