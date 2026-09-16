export const AnalyticsEvent = {
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked",
  FolderAccessSheetOpened: "Folder Access Sheet Opened",
  FolderAccessAddSheetOpened: "Folder Access Add Sheet Opened"
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

export type OrganizationAnalyticsEventMap = {
  [AnalyticsEvent.PaywallViewed]: PaywallProperties;
  [AnalyticsEvent.PaywallUpgradeClicked]: PaywallProperties;
  [AnalyticsEvent.FolderAccessSheetOpened]: FolderAccessSheetOpenedProperties;
  [AnalyticsEvent.FolderAccessAddSheetOpened]: FolderAccessAddSheetOpenedProperties;
};

export type OrganizationAnalyticsEvent = keyof OrganizationAnalyticsEventMap;
