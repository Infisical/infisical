import type { UpgradeFeatureKey } from "@app/components/license/UpgradePlanModal";

export enum IdentityFormTab {
  Advanced = "advanced",
  Lockout = "lockout",
  Configuration = "configuration"
}

export const IDENTITY_AUTH_FORM_ID = "identity-auth-form";

export type UpgradePlanModalData = {
  featureKey?: UpgradeFeatureKey;
  featureName?: string;
  isEnterpriseFeature?: boolean;
};
