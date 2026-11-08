import { TInstanceFeatures } from "../../ce/model/instance-entitlements";
import { TEntitlementsResponse } from "../../ce/service/license-server-types/license-server-types";

// Every cloud plan includes default storage for session logs, free orgs included, unless the org's plan or an override
// turns it off. The License Server's default for the key is off, which is what self-hosted licenses get, so only a
// value a plan or override set is taken here. Without entitlements (the stand-in plan while the License Server can't
// be reached) it's on. getFeature() reads the License Server directly and skips this rule, so session logs have to
// read the flag from the plan.
export const withCloudPlanDefaults = (
  plan: TInstanceFeatures,
  entitlements: TEntitlementsResponse | null
): TInstanceFeatures => {
  const source = entitlements?.features.agent_vault_managed_storage?.source;
  if (source && source !== "default") return plan;
  return { ...plan, agentVaultManagedStorage: true };
};
