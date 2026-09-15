export const AnalyticsEvent = {
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked",
  BillingCheckoutStarted: "Billing Checkout Started",
  BillingCheckoutCompleted: "Billing Checkout Completed",
  BillingCheckoutCanceled: "Billing Checkout Canceled",
  BillingSubscriptionUpdated: "Billing Subscription Updated",
  BillingSubscriptionUpgraded: "Billing Subscription Upgraded"
} as const;

type PaywallProperties = {
  paywallText: string;
  sourcePath: string;
  isEnterpriseFeature: boolean;
};

export type OrganizationAnalyticsEventMap = {
  [AnalyticsEvent.PaywallViewed]: PaywallProperties;
  [AnalyticsEvent.PaywallUpgradeClicked]: PaywallProperties;
  [AnalyticsEvent.BillingCheckoutStarted]: {
    productId: string;
    plan: string;
    cadence: "monthly" | "annual";
  };
  [AnalyticsEvent.BillingCheckoutCompleted]: Record<string, never>;
  [AnalyticsEvent.BillingCheckoutCanceled]: Record<string, never>;
  [AnalyticsEvent.BillingSubscriptionUpdated]: {
    productId: string;
    plan: string;
    cadence: "monthly" | "annual";
    subscriptionId?: string;
  };
  [AnalyticsEvent.BillingSubscriptionUpgraded]: {
    productId: string;
    fromPlan: string;
    toPlan: string;
    subscriptionId?: string;
    isTrialConversion: boolean;
  };
};

export type OrganizationAnalyticsEvent = keyof OrganizationAnalyticsEventMap;
