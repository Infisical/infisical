export const BillingProduct = {
  SecretsManagement: "secrets_management"
} as const;

export const BillingPlan = {
  Pro: "pro",
  Advanced: "advanced",
  Enterprise: "enterprise"
} as const;

export const UpgradeFeature = {
  DynamicSecrets: "dynamic-secrets",
  SecretRotations: "secret-rotations",
  HoneyTokens: "honey-tokens",
  SecretsBrokering: "secrets-brokering",
  PointInTimeRecovery: "point-in-time-recovery",
  FolderAccessControls: "folder-access-controls",
  SecretImportReplication: "secret-import-replication",
  SecretAccessInsights: "secret-access-insights",
  EnterpriseSecretSyncs: "enterprise-secret-syncs"
} as const;

export const UpgradeContinuation = {
  CreateDynamicSecret: "create-dynamic-secret",
  CreateSecretRotation: "create-secret-rotation",
  CreateHoneyToken: "create-honey-token",
  CreateProxiedService: "create-proxied-service",
  ViewCommitHistory: "view-commit-history",
  ManageFolderAccess: "manage-folder-access",
  CreateSecretImport: "create-secret-import",
  ViewSecretAccess: "view-secret-access",
  CreateEnterpriseSecretSync: "create-enterprise-secret-sync"
} as const;

export type UpgradeIntent = {
  featureKey: (typeof UpgradeFeature)[keyof typeof UpgradeFeature];
  productKey: (typeof BillingProduct)[keyof typeof BillingProduct];
  planKey: (typeof BillingPlan)[keyof typeof BillingPlan];
  continuation: (typeof UpgradeContinuation)[keyof typeof UpgradeContinuation];
  upgradeLabel?: string;
  title: string;
  description: string;
};

export type UpgradeReturnTarget = { environment?: string; folderPath?: string };

export const DynamicSecretsUpgradeIntent = {
  featureKey: UpgradeFeature.DynamicSecrets,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Advanced,
  continuation: UpgradeContinuation.CreateDynamicSecret,
  upgradeLabel: "Unlock Dynamic Secrets",
  title: "Add Dynamic Secrets",
  description:
    "Dynamic secrets are included with Secrets Management Advanced. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const SecretRotationsUpgradeIntent = {
  featureKey: UpgradeFeature.SecretRotations,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateSecretRotation,
  upgradeLabel: "Unlock Secret Rotations",
  title: "Add Secret Rotation",
  description:
    "Secret rotations are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const HoneyTokensUpgradeIntent = {
  featureKey: UpgradeFeature.HoneyTokens,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateHoneyToken,
  upgradeLabel: "Unlock Honey Tokens",
  title: "Add Honey Token",
  description:
    "Honey tokens are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const SecretsBrokeringUpgradeIntent = {
  featureKey: UpgradeFeature.SecretsBrokering,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateProxiedService,
  upgradeLabel: "Unlock Secrets Brokering",
  title: "Add Proxied Service",
  description:
    "Secrets brokering is included with Secrets Management Enterprise. Review the plan to continue."
} satisfies UpgradeIntent;

export const PointInTimeRecoveryUpgradeIntent = {
  featureKey: UpgradeFeature.PointInTimeRecovery,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ViewCommitHistory,
  upgradeLabel: "Unlock Point-in-Time Recovery",
  title: "View Commit History",
  description:
    "Point-in-time recovery is included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const FolderAccessControlsUpgradeIntent = {
  featureKey: UpgradeFeature.FolderAccessControls,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ManageFolderAccess,
  upgradeLabel: "Unlock Folder Access Controls",
  title: "Manage Folder Access",
  description:
    "Folder-level access controls are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const SecretImportReplicationUpgradeIntent = {
  featureKey: UpgradeFeature.SecretImportReplication,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateSecretImport,
  upgradeLabel: "Unlock Secret Import Replication",
  title: "Replicate Secret Import",
  description:
    "Secret import replication is included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const SecretAccessInsightsUpgradeIntent = {
  featureKey: UpgradeFeature.SecretAccessInsights,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ViewSecretAccess,
  upgradeLabel: "Unlock Secret Access Insights",
  title: "View Secret Access",
  description:
    "Secret access insights are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const EnterpriseSecretSyncsUpgradeIntent = {
  featureKey: UpgradeFeature.EnterpriseSecretSyncs,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateEnterpriseSecretSync,
  upgradeLabel: "Unlock Enterprise Secret Syncs",
  title: "Choose Enterprise Secret Sync",
  description:
    "Enterprise Secret Sync destinations are included with Secrets Management Enterprise. Review the plan to continue."
} satisfies UpgradeIntent;

export const buildUpgradeReturnPath = (
  intent: UpgradeIntent,
  location: Location,
  target?: UpgradeReturnTarget
) => {
  const search = new URLSearchParams(location.search);
  search.set("upgradeContinuation", intent.continuation);
  if (target?.environment) search.set("upgradeEnvironment", target.environment);
  if (target?.folderPath) search.set("upgradeFolderPath", target.folderPath);
  const fullPath = `${location.pathname}?${search.toString()}${location.hash}`;
  if (fullPath.length <= 2048) return fullPath;

  const continuation = new URLSearchParams({ upgradeContinuation: intent.continuation });
  if (target?.environment) continuation.set("upgradeEnvironment", target.environment);
  if (target?.folderPath) continuation.set("upgradeFolderPath", target.folderPath);
  const minimalPath = `${location.pathname}?${continuation.toString()}`;
  return minimalPath.length <= 2048 ? minimalPath : location.pathname;
};

export const getSafeUpgradeReturnPath = (returnPath: string | null, origin: string) => {
  if (!returnPath || returnPath.length > 2048 || !returnPath.startsWith("/")) {
    return null;
  }

  const hasUnsafeCharacter = [...returnPath].some((character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint <= 31 || codePoint === 127 || character === "\\";
  });
  if (hasUnsafeCharacter) {
    return null;
  }

  try {
    return new URL(returnPath, origin).origin === new URL(origin).origin ? returnPath : null;
  } catch {
    return null;
  }
};
