import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum PowerDnsConnectionMethod {
  ApiKey = "api-key"
}

export type TPowerDnsConnection = TRootAppConnection & { app: AppConnection.PowerDns } & {
  method: PowerDnsConnectionMethod.ApiKey;
  credentials: {
    apiUrl: string;
    apiKey: string;
    serverId?: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
