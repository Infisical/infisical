import { apiRequest } from "@app/config/request";
import { useSecretSyncOptions } from "@app/hooks/api/secretSyncs/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { HoneyTokenLimit, SecretsPlanAdapter } from "./contract-plan";

const fetchHoneyTokenLimit = async (projectId: string) => {
  const { data } = await apiRequest.get<HoneyTokenLimit>("/api/v1/honey-tokens/limits", {
    params: { projectId }
  });
  return data;
};

export const secretsPlanLive: SecretsPlanAdapter = {
  useOverviewPlan: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useHoneyTokenLimit: () => fetchHoneyTokenLimit,
  useSecretSyncOptions: () => useSecretSyncOptions()
};
