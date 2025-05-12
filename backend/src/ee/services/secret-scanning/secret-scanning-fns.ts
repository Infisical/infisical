import { getConfig } from "@app/lib/config/env";

export const canUseSecretScanning = (orgId: string) => {
  const appCfg = getConfig();

  if (!appCfg.isCloud) {
    return true;
  }

  return appCfg.SECRET_SCANNING_ORG_WHITELIST?.includes(orgId);
};
