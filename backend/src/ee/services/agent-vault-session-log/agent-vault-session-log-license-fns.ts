import { Plan, PlanFeature, TLicenseService, TPlanFeatures } from "@app/domains/platform/license/ce/module";
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

export type TSessionLogEntitlement = "licensed" | "unlicensed";

const hasStorageOnPlan = (plan: Plan, type: ObjectStorageType) =>
  plan.has(type === ObjectStorageType.Default ? PlanFeature.AgentVaultManagedStorage : PlanFeature.AgentVaultByoS3);

// Whether the org's plan includes this storage type, and the plan to take retention from.
export const getSessionLogEntitlement = async (
  licenseService: TLicenseService,
  orgId: string,
  storageType: ObjectStorageType
): Promise<{
  entitlement: TSessionLogEntitlement;
  plan: Pick<TPlanFeatures, "agentVaultSessionLogRetentionDays">;
}> => {
  const plan = await licenseService.getPlan(orgId);
  return { entitlement: hasStorageOnPlan(plan, storageType) ? "licensed" : "unlicensed", plan };
};

// For other plan limits null means no limit, but here it still means the default number of days, so that a plan
// never keeps logs in default storage forever by accident. Make null mean "keep forever" here if that's ever wanted.
export const getSessionLogRetentionDays = (plan: Pick<TPlanFeatures, "agentVaultSessionLogRetentionDays"> | null) =>
  plan?.agentVaultSessionLogRetentionDays ?? AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS;
