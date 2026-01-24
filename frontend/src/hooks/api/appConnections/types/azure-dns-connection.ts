import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureDNSConnectionMethod {
  ClientSecret = "client-secret"
}

export type TAzureDNSConnection = TRootAppConnection & { app: AppConnection.AzureDNS } & {
  method: AzureDNSConnectionMethod.ClientSecret;
  credentials: {
    tenantId: string;
    clientId: string;
    subscriptionId: string;
  };
};
