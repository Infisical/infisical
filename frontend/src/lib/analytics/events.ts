export const AnalyticsEvent = {
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked"
} as const;

type PaywallProperties = {
  paywallKey: string;
  paywallText: string;
  route: string;
  isEnterpriseFeature: boolean;
};

export type OrganizationAnalyticsEventMap = {
  [AnalyticsEvent.PaywallViewed]: PaywallProperties;
  [AnalyticsEvent.PaywallUpgradeClicked]: PaywallProperties;
};

export type OrganizationAnalyticsEvent = keyof OrganizationAnalyticsEventMap;
