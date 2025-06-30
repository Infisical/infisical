import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

import { ZabbixSyncScope } from "../../appConnections/zabbix";

export type TZabbixSync = TRootSecretSync & {
  destination: SecretSync.Zabbix;
  destinationConfig:
    | {
        scope: ZabbixSyncScope.Host;
        hostId: string;
        hostName: string;
        macroType: number;
      }
    | {
        scope: ZabbixSyncScope.Global;
        macroType: number;
      };
  connection: {
    app: AppConnection.Zabbix;
    name: string;
    id: string;
  };
};
