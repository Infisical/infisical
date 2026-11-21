import type { TSecretSyncOption } from "@app/hooks/api/secretSyncs/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import type { V4QueryResult } from "../contract";

export type OverviewPlan = Pick<
  SubscriptionPlan,
  | "environmentLimit"
  | "dynamicSecret"
  | "secretRotation"
  | "honeyTokens"
  | "pitRecovery"
  | "secretsFolderRbac"
  | "secretAccessInsights"
  | "secretApproval"
  | "enterpriseSecretSyncs"
>;

export type HoneyTokenLimit = { used: number; limit: number | null };

export type SecretsPlanAdapter = {
  useOverviewPlan: (orgId: string) => V4QueryResult<OverviewPlan>;
  useHoneyTokenLimit: () => (projectId: string) => Promise<HoneyTokenLimit>;
  useSecretSyncOptions: () => V4QueryResult<TSecretSyncOption[]>;
};
