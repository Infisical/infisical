import { getConfig } from "@app/lib/config/env";

export const canUseCrossProjectSecretSharing = (orgId: string) => {
  const appCfg = getConfig();
  return appCfg.CROSS_PROJECT_SECRET_SHARING_ORG_WHITELIST.includes(orgId);
};
