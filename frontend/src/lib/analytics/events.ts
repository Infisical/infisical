export const AnalyticsEvent = {
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked",
  FolderAccessSheetOpened: "Folder Access Sheet Opened",
  FolderAccessAddSheetOpened: "Folder Access Add Sheet Opened",
  FolderAccessGrantSheetOpened: "Folder Access Grant Sheet Opened"
  ThemePreferenceChanged: "Theme Preference Changed"
} as const;

type PaywallProperties = {
  paywallKey: string;
  paywallText: string;
  route: string;
  isEnterpriseFeature: boolean;
};

export type FolderAccessSheetSource = "breadcrumb" | "folder_row";

type FolderAccessSheetOpenedProperties = {
  source: FolderAccessSheetSource;
  projectId: string;
};

type FolderAccessAddSheetOpenedProperties = {
  projectId: string;
};

export type FolderAccessGrantSheetSource = "card_header" | "empty_state";

type FolderAccessGrantSheetOpenedProperties = {
  source: FolderAccessGrantSheetSource;
  actorType: "user" | "identity";
  projectId: string;
};

export type OrganizationAnalyticsEventMap = {
  [AnalyticsEvent.PaywallViewed]: PaywallProperties;
  [AnalyticsEvent.PaywallUpgradeClicked]: PaywallProperties;
  [AnalyticsEvent.FolderAccessSheetOpened]: FolderAccessSheetOpenedProperties;
  [AnalyticsEvent.FolderAccessAddSheetOpened]: FolderAccessAddSheetOpenedProperties;
  [AnalyticsEvent.FolderAccessGrantSheetOpened]: FolderAccessGrantSheetOpenedProperties;
};

export type OrganizationAnalyticsEvent = keyof OrganizationAnalyticsEventMap;

export type ThemePreferenceChangedProperties = {
  source: "command-menu" | "profile-menu";
  theme: "dark" | "light" | "system";
  resolvedTheme: "dark" | "light";
};
