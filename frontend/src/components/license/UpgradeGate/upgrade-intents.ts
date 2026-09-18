export const BillingProduct = {
  SecretsManagement: "secrets_management"
} as const;

export const UpgradeFeature = {
  DynamicSecrets: "dynamic-secrets"
} as const;

export const UpgradeContinuation = {
  CreateDynamicSecret: "create-dynamic-secret"
} as const;

export type UpgradeIntent = {
  featureKey: (typeof UpgradeFeature)[keyof typeof UpgradeFeature];
  productKey: (typeof BillingProduct)[keyof typeof BillingProduct];
  continuation: (typeof UpgradeContinuation)[keyof typeof UpgradeContinuation];
  title: string;
  description: string;
};

export const DynamicSecretsUpgradeIntent = {
  featureKey: UpgradeFeature.DynamicSecrets,
  productKey: BillingProduct.SecretsManagement,
  continuation: UpgradeContinuation.CreateDynamicSecret,
  title: "Add Dynamic Secrets",
  description:
    "Dynamic secrets are included with Secrets Management Advanced. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const buildUpgradeReturnPath = (intent: UpgradeIntent, location: Location) => {
  const search = new URLSearchParams(location.search);
  search.set("upgradeContinuation", intent.continuation);
  return `${location.pathname}?${search.toString()}${location.hash}`;
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
