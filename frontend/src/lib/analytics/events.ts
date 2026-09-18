export const AnalyticsEvent = {
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked",
  ThemePreferenceChanged: "Theme Preference Changed"
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

export type ThemePreferenceChangedProperties = {
  source: "command-menu" | "profile-menu";
  theme: "dark" | "light" | "system";
  resolvedTheme: "dark" | "light";
};
