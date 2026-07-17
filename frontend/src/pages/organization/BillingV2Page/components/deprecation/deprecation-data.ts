import { BillingV2Entitlement } from "@app/hooks/api";

import { tierLabel } from "../../billing-v2-format";

export type Deprecation = NonNullable<BillingV2Entitlement["deprecation"]>;

export type DeprecatedEntry = {
  productId: string;
  name: string;
  planTier?: string;
  deprecation: Deprecation;
};

// Tone tokens for the banner / dialog: warning for a retiring plan, danger for a discontinued product
// (a retiring plan escalates to danger inside the final window).
export const DEPRECATION_TONE = {
  warning: {
    container: "border-warning/30 bg-warning/[0.04]",
    iconBox: "border-warning/20 bg-warning/10 text-warning",
    pill: "border-warning/20 bg-warning/[0.06]",
    chip: "border border-warning/30 bg-warning/10 text-warning"
  },
  danger: {
    container: "border-danger/30 bg-danger/[0.04]",
    iconBox: "border-danger/20 bg-danger/10 text-danger",
    pill: "border-danger/20 bg-danger/[0.06]",
    chip: "border border-danger/30 bg-danger/10 text-danger"
  }
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
