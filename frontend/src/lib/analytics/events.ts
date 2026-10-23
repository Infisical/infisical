export const AnalyticsEvent = {
  SecretsOverviewViewed: "Secrets Overview Viewed",
  SecretsOverviewLoaded: "Secrets Overview Loaded",
  SecretsOverviewInteraction: "Secrets Overview Interaction",
  SecretsOverviewFlowProgressed: "Secrets Overview Flow Progressed",
  SecretsActivationModalViewed: "Secrets Activation Modal Viewed",
  SecretsActivationModalMembersInvited: "Secrets Activation Modal Members Invited",
  SecretsActivationModalDismissed: "Secrets Activation Modal Dismissed",
  PaywallViewed: "Paywall Viewed",
  PaywallUpgradeClicked: "Paywall Upgrade Clicked",
  FolderAccessSheetOpened: "Folder Access Sheet Opened",
  FolderAccessAddSheetOpened: "Folder Access Add Sheet Opened",
  FolderAccessGrantSheetOpened: "Folder Access Grant Sheet Opened",
  SecretsAddResourceMenuOpened: "Secrets Add Resource Menu Opened",
  SecretsAddResourceActionSelected: "Secrets Add Resource Action Selected",
  ThemePreferenceChanged: "Theme Preference Changed",
  SignupFlowCompleted: "Signup Flow Completed",
  BillingCancellationReasonSubmitted: "Billing Cancellation Reason Submitted",
  OnboardingResourceClicked: "Onboarding Resource Clicked",
  OnboardingDocumentationClicked: "Onboarding Documentation Clicked",
  SecretScanningOpened: "Secret Scanning Opened"
} as const;

export type OverviewCountBucket = "0" | "1" | "2-5" | "6-20" | "21-100" | "101+";

export type OverviewResourceType =
  | "secret"
  | "folder"
  | "dynamic-secret"
  | "secret-rotation"
  | "honey-token"
  | "proxied-service"
  | "secret-import"
  | "secret-sync"
  | "mixed";

export type OverviewInteractionProperties = {
  action:
    | "environment-selection"
    | "search-started"
    | "search-cleared"
    | "search-all-folders"
    | "resource-filter"
    | "tag-filter"
    | "clear-tags"
    | "folder-navigation"
    | "selection"
    | "select-page"
    | "reveal"
    | "hide"
    | "batch-mode-enabled"
    | "batch-mode-disabled"
    | "pagination"
    | "sort"
    | "history"
    | "bulk-tags"
    | "bulk-move"
    | "create-entry"
    | "import-entry";
  source: "header" | "row" | "bulk" | "breadcrumb" | "search" | "empty-state";
  resourceType?: OverviewResourceType;
  countBucket?: OverviewCountBucket;
};

export type OverviewFlowProperties = {
  action: "create" | "update" | "delete" | "import" | "export" | "copy" | "commit" | "discard";
  resourceType: OverviewResourceType;
  source:
    | "menu"
    | "empty-state"
    | "quick-add"
    | "form"
    | "row"
    | "bulk"
    | "paste"
    | "drop"
    | "upload"
    | "breadcrumb"
    | "header";
  phase:
    | "opened"
    | "input-received"
    | "submitted"
    | "canceled"
    | "staged"
    | "approval-requested"
    | "response-received"
    | "partial-response"
    | "failed"
    | "discarded"
    | "empty"
    | "clipboard-written"
    | "download-started";
  countBucket?: OverviewCountBucket;
  approvalCountBucket?: OverviewCountBucket;
  responseCountBucket?: OverviewCountBucket;
  failureCountBucket?: OverviewCountBucket;
  folderResponseCountBucket?: OverviewCountBucket;
  folderFailureCountBucket?: OverviewCountBucket;
  provenance?: "committed" | "pending";
  destination?: "clipboard" | "download" | "environment";
};

export type OverviewScopeProperties = {
  projectId: string;
  route: "/organizations/$orgId/projects/secret-management/$projectId/overview";
  environmentMode: "none" | "single" | "multiple";
  folderScope: "root" | "nested";
  editMode: "immediate" | "batch";
};

export type SecretsActivationProperties = {
  projectId: string;
  projectType?:
    | "secret-manager"
    | "cert-manager"
    | "kms"
    | "secret-scanning"
    | "pam"
    | "agent-vault";
  presentation: "modal" | "card";
  experiment_variant: "control" | "card" | null;
  "$feature/secrets-activation-presentation": "control" | "card" | null;
};

type PaywallProperties = {
  paywallKey: string;
  paywallText: string;
  route: string;
  isEnterpriseFeature: boolean;
  plan: string;
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

export type BillingCancellationAction = "remove_product" | "cancel_subscription" | "cancel_trial";

type BillingCancellationReasonSubmittedProperties = {
  action: BillingCancellationAction;
  productId: string;
  reason: string;
  comment?: string;
};

export type OnboardingResource = "github" | "discussions" | "youtube";

export type OnboardingResourceClickedProperties = {
  resource: OnboardingResource;
};

export type SecretScanningOpenedProperties = {
  hasSecretScanning: boolean;
  plan: string;
};

export type OrganizationAnalyticsEventMap = {
  [AnalyticsEvent.SecretsActivationModalViewed]: SecretsActivationProperties;
  [AnalyticsEvent.SecretsActivationModalMembersInvited]: SecretsActivationProperties & {
    invitedCount: number;
  };
  [AnalyticsEvent.SecretsActivationModalDismissed]: SecretsActivationProperties;
  [AnalyticsEvent.SecretsOverviewViewed]: OverviewScopeProperties;
  [AnalyticsEvent.SecretsOverviewLoaded]: OverviewScopeProperties & {
    resourceCountBucket: OverviewCountBucket;
    state: "empty" | "populated";
  };
  [AnalyticsEvent.SecretsOverviewInteraction]: OverviewScopeProperties &
    OverviewInteractionProperties;
  [AnalyticsEvent.SecretsOverviewFlowProgressed]: OverviewScopeProperties & OverviewFlowProperties;
  [AnalyticsEvent.PaywallViewed]: PaywallProperties;
  [AnalyticsEvent.PaywallUpgradeClicked]: PaywallProperties;
  [AnalyticsEvent.FolderAccessSheetOpened]: FolderAccessSheetOpenedProperties;
  [AnalyticsEvent.FolderAccessAddSheetOpened]: FolderAccessAddSheetOpenedProperties;
  [AnalyticsEvent.FolderAccessGrantSheetOpened]: FolderAccessGrantSheetOpenedProperties;
  [AnalyticsEvent.SecretsAddResourceMenuOpened]: SecretsAddResourceMenuOpenedProperties;
  [AnalyticsEvent.SecretsAddResourceActionSelected]: SecretsAddResourceActionSelectedProperties;
  [AnalyticsEvent.BillingCancellationReasonSubmitted]: BillingCancellationReasonSubmittedProperties;
  [AnalyticsEvent.OnboardingResourceClicked]: OnboardingResourceClickedProperties;
  [AnalyticsEvent.SecretScanningOpened]: SecretScanningOpenedProperties;
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
