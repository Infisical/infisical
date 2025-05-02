import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listHCVaultMounts } from "./hc-vault-connection-fns";
import { THCVaultConnection } from "./hc-vault-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<THCVaultConnection>;

export const hcVaultConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listMounts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.HCVault, connectionId, actor);

    try {
      const mounts = await listHCVaultMounts(appConnection);
      return mounts;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Hashicorp Vault");
      return [];
    }
  };

  return {
    listMounts
  };
};
