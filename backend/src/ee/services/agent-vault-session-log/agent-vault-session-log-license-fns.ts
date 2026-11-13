import { Plan, PlanFeature, TLicenseService, TPlanFeatures } from "@app/domains/platform/license/ce/module";
import { logger } from "@app/lib/logger";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import {
  AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS,
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_NOT_ON_PLAN,
  AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN,
  AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS
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

// Whether the org's plan includes this storage type, and the plan to take retention from. While the License Server
// can't be reached, getPlan returns a stand-in plan that leaves out external storage and includes default storage.
// Trusting it would stop recording for orgs that pay for external storage, and for default storage it would hide a
// downgrade and tag uploads with the stand-in plan's retention. So in that case the last plan the License Server
// returned decides, if it's under an hour old. Without one the answer is "unknown", and each caller decides what that
// means.
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
  if (isOnPlan && storageType !== ObjectStorageType.Default) return { entitlement: "licensed", plan };
  if (!(await licenseService.isServingFallbackPlan(orgId))) {
    return { entitlement: isOnPlan ? "licensed" : "unlicensed", plan };
  }

  const lastKnown = await licenseService.getLastKnownPlan(orgId);
  // Retention comes from the last real plan whenever one is cached, even one too old to decide yes or no. The tag is
  // fixed at upload, so tagging with the stand-in plan's retention would delete a longer plan's logs early.
  let decision: Awaited<ReturnType<typeof getSessionLogEntitlement>> = isOnPlan
    ? { entitlement: "licensed", plan: lastKnown?.plan ?? plan }
    : { entitlement: "unknown", plan: lastKnown?.plan ?? null };
  if (lastKnown && Date.now() - lastKnown.fetchedAt <= AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS) {
    decision = {
      entitlement: hasStorageOnPlan(lastKnown.plan, storageType) ? "licensed" : "unlicensed",
      plan: lastKnown.plan
    };
  }

  const now = Date.now();
  if (now - (fallbackLoggedAt.get(orgId) ?? 0) >= FALLBACK_LOG_INTERVAL_MS) {
    fallbackLoggedAt.set(orgId, now);
    logger.warn(
      `agentVaultSessionLog: the License Server is unreachable, so session logs are decided from the last plan it returned [orgId=${orgId}] [storageType=${storageType}] [entitlement=${decision.entitlement}] [lastKnownAgeMs=${lastKnown ? now - lastKnown.fetchedAt : "none"}]`
    );
  }
  return decision;
};

// For other plan limits null means no limit, but here it still means the default number of days, so that a plan
// never keeps logs in default storage forever by accident. Make null mean "keep forever" here if that's ever wanted.
export const getSessionLogRetentionDays = (plan: Pick<TPlanFeatures, "agentVaultSessionLogRetentionDays"> | null) =>
  plan?.agentVaultSessionLogRetentionDays ?? AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS;
