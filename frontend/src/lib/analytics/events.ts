export const AnalyticsEvent = {
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked",
  FolderAccessSheetOpened: "Folder Access Sheet Opened",
  FolderAccessAddSheetOpened: "Folder Access Add Sheet Opened",
  FolderAccessGrantSheetOpened: "Folder Access Grant Sheet Opened",
  SecretsAddResourceMenuOpened: "Secrets Add Resource Menu Opened",
  SecretsAddResourceActionSelected: "Secrets Add Resource Action Selected",
  ThemePreferenceChanged: "Theme Preference Changed",
  SignupFlowCompleted: "Signup Flow Completed"
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

export type SecretsAddResourceMenuSource = "toolbar" | "object-type";
export type SecretsAddResourceMenuLevel = "root" | "more";
export type SecretsAddResourceEnvironmentMode = "single" | "multiple";
export type SecretsAddResourceAction =
  | "secret"
  | "upload-secrets"
  | "folder"
  | "dynamic-secret"
  | "secret-rotation"
  | "honey-token"
  | "proxied-service"
  | "secret-import"
  | "copy-secrets"
  | "secret-sync"
  | "import-from-vault"
  | "import-from-doppler";

type SecretsAddResourceMenuOpenedProperties = {
  projectId: string;
  source: SecretsAddResourceMenuSource;
  menuLevel: SecretsAddResourceMenuLevel;
  environmentMode: SecretsAddResourceEnvironmentMode;
};

type SecretsAddResourceActionSelectedProperties = {
  projectId: string;
  source: SecretsAddResourceMenuSource;
  action: SecretsAddResourceAction;
  environmentMode: SecretsAddResourceEnvironmentMode;
};

export type OrganizationAnalyticsEventMap = {
  [AnalyticsEvent.PaywallViewed]: PaywallProperties;
  [AnalyticsEvent.PaywallUpgradeClicked]: PaywallProperties;
  [AnalyticsEvent.FolderAccessSheetOpened]: FolderAccessSheetOpenedProperties;
  [AnalyticsEvent.FolderAccessAddSheetOpened]: FolderAccessAddSheetOpenedProperties;
  [AnalyticsEvent.FolderAccessGrantSheetOpened]: FolderAccessGrantSheetOpenedProperties;
  [AnalyticsEvent.SecretsAddResourceMenuOpened]: SecretsAddResourceMenuOpenedProperties;
  [AnalyticsEvent.SecretsAddResourceActionSelected]: SecretsAddResourceActionSelectedProperties;
};

export type OrganizationAnalyticsEvent = keyof OrganizationAnalyticsEventMap;

export type ThemePreferenceChangedProperties = {
  source: "command-menu" | "navbar-toggle" | "profile-menu";
  theme: "dark" | "light" | "system";
  resolvedTheme: "dark" | "light";
};

export type SignupFlowCompletedProperties = {
  signupMethod: "email" | "sso";
  signupFlowVariant: "control" | "test" | "unassigned";
};
