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
      "No license is active, so paid features stay locked until you set LICENSE_KEY on the server and restart it.",
    pageDescription: "View products and usage for this unlicensed instance.",
    inactiveProductNote: "Requires a self-hosted license key from sales."
  },
  online: {
    method: "License",
    methodHint: "Synced from Infisical",
    title: "Set by Your License",
    detail:
      "Products and limits sync from your Infisical license, so contact sales to change them.",
    pageDescription: "View products and usage set by your Infisical license.",
    inactiveProductNote: "Not in your license, so contact sales to add it."
  },
  offline: {
    method: "Offline License",
    methodHint: "Set by your license key",
    title: "Offline License",
    detail:
      "To change your plan, get an updated key from sales, replace LICENSE_KEY on the server, and restart it.",
    pageDescription: "Your plan is set by an offline license.",
    inactiveProductNote: "Not in your offline license, so contact sales for an updated key."
  },
  unavailable: {
    method: "License",
    methodHint: "Details unavailable",
    title: "License Details Unavailable",
    detail: "License details couldn't be read, so contact sales to get or update a license key.",
    pageDescription: "View your products and usage.",
    inactiveProductNote: "Not active on this instance, so contact sales for licensing options."
  }
};
