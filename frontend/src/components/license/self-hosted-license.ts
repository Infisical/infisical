import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

export type SelfHostedLicenseState = "unlicensed" | "online" | "offline" | "unavailable";

export const SELF_HOSTED_CONTACT_SALES_URL = "https://infisical.com/talk-to-us";
export const SELF_HOSTED_LICENSE_DOCS_URL = "https://infisical.com/docs/self-hosting/ee";

export const getSelfHostedLicenseState = (
  plan?: Pick<SubscriptionPlan, "isOffline" | "productPlans" | "slug"> | null
): SelfHostedLicenseState => {
  if (!plan) return "unavailable";
  if (plan.isOffline) return "offline";
  if (Array.isArray(plan.productPlans)) return "online";
  if (!plan.slug) return "unlicensed";
  return "unavailable";
};

type SelfHostedLicenseCopy = {
  method: string;
  methodHint: string;
  title: string;
  detail: string;
  pageDescription: string;
  inactiveProductNote: string;
};

export const SELF_HOSTED_LICENSE_COPY: Record<SelfHostedLicenseState, SelfHostedLicenseCopy> = {
  unlicensed: {
    method: "Free",
    methodHint: "No active license",
    title: "No License Active",
    detail:
      "This instance runs without a license, so paid features are unavailable. Contact sales for a license key, then set it as LICENSE_KEY on the server to activate it.",
    pageDescription: "View your products and usage. This instance has no active license.",
    inactiveProductNote: "Requires a license. Contact sales for a self-hosted license key."
  },
  online: {
    method: "License",
    methodHint: "Synced from Infisical",
    title: "Set by Your License",
    detail:
      "Products and limits come from your Infisical license. Contact sales to change your plan; updates sync to this instance automatically.",
    pageDescription: "View your products and usage. Your plan is set by your Infisical license.",
    inactiveProductNote: "Not included in your license. Contact sales to add it."
  },
  offline: {
    method: "Offline License",
    methodHint: "Set by your license key",
    title: "Offline License",
    detail:
      "This instance uses an offline license, so plan changes aren't available in-product. Contact sales for an updated license key, then replace LICENSE_KEY on the server and restart it.",
    pageDescription: "Your plan is set by an offline license.",
    inactiveProductNote: "Not included in your offline license. Contact sales for an updated key."
  },
  unavailable: {
    method: "License",
    methodHint: "Details unavailable",
    title: "License Details Unavailable",
    detail:
      "License details for this instance couldn't be read. Your products are unaffected. Self-hosted plans are set by a license key; contact sales to get or update one.",
    pageDescription: "View your products and usage.",
    inactiveProductNote: "Not active on this instance. Contact sales for licensing options."
  }
};
