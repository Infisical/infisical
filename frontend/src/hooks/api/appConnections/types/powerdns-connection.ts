import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum PowerDNSConnectionMethod {
  APIKey = "api-key"
}

export type TPowerDNSConnection = TRootAppConnection & { app: AppConnection.PowerDNS } & {
  method: PowerDNSConnectionMethod.APIKey;
  credentials: {
    baseUrl: string;
  };
};
