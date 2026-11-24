import { Plan, PlanFeature, TLicenseService, TPlanFeatures } from "@app/domains/platform/license/ce/module";
import { logger } from "@app/lib/logger";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import {
  AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS,
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_NOT_ON_PLAN,
  AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN
} from "./agent-vault-session-log-constants";

export const getSessionLogNotOnPlanMessage = (storageType: ObjectStorageType) =>
  storageType === ObjectStorageType.Default
    ? AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_NOT_ON_PLAN
    : AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN;

export type TSessionLogEntitlement = "licensed" | "unlicensed" | "unknown";

const hasStorageOnPlan = (plan: Plan, type: ObjectStorageType) =>
  plan.has(type === ObjectStorageType.Default ? PlanFeature.AgentVaultManagedStorage : PlanFeature.AgentVaultByoS3);

const FALLBACK_LOG_INTERVAL_MS = 5 * 60_000;
const fallbackLoggedAt = new Map<string, number>();

// Whether the org's plan includes this storage type, and the plan to take retention from. getPlan keeps serving the
// last plan the License Server returned while it is down, so it returns a stand-in plan (plan.isFallback) only when
// no plan was ever cached or the database or the key store can't answer. That plan leaves out external storage and
// includes default storage: trusting it would stop recording for orgs that pay for external storage, so without
// default storage on it the answer is "unknown", and each caller decides what that means.
export const getSessionLogEntitlement = async (
  licenseService: TLicenseService,
  orgId: string,
  storageType: ObjectStorageType
): Promise<{
  entitlement: TSessionLogEntitlement;
  plan: Pick<TPlanFeatures, "agentVaultSessionLogRetentionDays"> | null;
}> => {
  const plan = await licenseService.getPlan(orgId);
  const isOnPlan = hasStorageOnPlan(plan, storageType);
  if (!plan.isFallback || isOnPlan) {
    return { entitlement: isOnPlan ? "licensed" : "unlicensed", plan };
  }

  const now = Date.now();
  if (now - (fallbackLoggedAt.get(orgId) ?? 0) >= FALLBACK_LOG_INTERVAL_MS) {
    fallbackLoggedAt.set(orgId, now);
    logger.warn(
      `agentVaultSessionLog: the plan can't be read, so session logs are not confirmed [orgId=${orgId}] [storageType=${storageType}]`
    );
  }
  return { entitlement: "unknown", plan: null };
};

// For other plan limits null means no limit, but here it still means the default number of days, so that a plan
// never keeps logs in default storage forever by accident. Make null mean "keep forever" here if that's ever wanted.
export const getSessionLogRetentionDays = (plan: Pick<TPlanFeatures, "agentVaultSessionLogRetentionDays"> | null) =>
  plan?.agentVaultSessionLogRetentionDays ?? AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS;
