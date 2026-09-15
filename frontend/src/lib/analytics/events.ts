export const AnalyticsEvent = {
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked",
  BillingProductActivationClicked: "Billing Product Activation Clicked",
  BillingPlanUpgradeClicked: "Billing Plan Upgrade Clicked",
  BillingCheckoutRedirected: "Billing Checkout Redirected",
  BillingCheckoutSuccessReturnViewed: "Billing Checkout Success Return Viewed",
  BillingCheckoutCanceledReturnViewed: "Billing Checkout Canceled Return Viewed"
} as const;

type PaywallProperties = {
  paywallText: string;
  sourcePath: string;
  isEnterpriseFeature: boolean;
};

export type OrganizationAnalyticsEventMap = {
  [AnalyticsEvent.PaywallViewed]: PaywallProperties;
  [AnalyticsEvent.PaywallUpgradeClicked]: PaywallProperties;
  [AnalyticsEvent.BillingProductActivationClicked]: {
    productId: string;
    plan: string;
    cadence: "monthly" | "annual";
  };
  [AnalyticsEvent.BillingPlanUpgradeClicked]: {
    productId: string;
    fromPlan: string;
    toPlan: string;
    isTrialConversion: boolean;
  };
  [AnalyticsEvent.BillingCheckoutRedirected]: {
    productId: string;
    plan: string;
    cadence: "monthly" | "annual";
  };
  [AnalyticsEvent.BillingCheckoutSuccessReturnViewed]: Record<string, never>;
  [AnalyticsEvent.BillingCheckoutCanceledReturnViewed]: Record<string, never>;
};

export type OrganizationAnalyticsEvent = keyof OrganizationAnalyticsEventMap;
