import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
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

export const hcVaultConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const listMounts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.HCVault, connectionId, actor);

    try {
      const mounts = await listHCVaultMounts(appConnection, gatewayService, gatewayV2Service);
      // Filter for KV version 2 mounts only and extract just the paths
      return mounts.filter((mount) => mount.type === "kv" && mount.version === "2").map((mount) => mount.path);
    } catch (error) {
      logger.error(error, "Failed to establish connection with Hashicorp Vault");
      return [];
    }
  };

  return {
    listMounts
  };
};
