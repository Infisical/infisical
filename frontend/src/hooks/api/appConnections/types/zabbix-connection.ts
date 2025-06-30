import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ZabbixConnectionMethod {
  ApiToken = "api-token"
}

export type TZabbixConnection = TRootAppConnection & { app: AppConnection.Zabbix } & {
  method: ZabbixConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
    instanceUrl: string;
  };
};
