import { SubscriptionPlan, SubscriptionPlanTypes } from "./types";

// Derive the plan label from the real plan slug, not feature booleans. Inferring "Enterprise" from a
// single entitled feature (e.g. groups) mislabels Pro orgs that bought an add-on granting it.
export const getSubscriptionPlanLabel = (subscription: SubscriptionPlan, suffix = "") => {
  const { slug } = subscription;
  if (
    slug === SubscriptionPlanTypes.Enterprise ||
    slug === SubscriptionPlanTypes.OnPremEnterprise
  ) {
    return `Enterprise${suffix}`;
  }
  if (!slug || slug === SubscriptionPlanTypes.Starter) {
    return `Free${suffix}`;
  }
  return `Pro${suffix}`;
};
