import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureBlobStorageConnectionMethod {
  ClientSecret = "client-secret",
  AccessKey = "access-key"
}

export type TAzureBlobStorageConnection = TRootAppConnection & {
  app: AppConnection.AzureBlobStorage;
} & (
    | {
        method: AzureBlobStorageConnectionMethod.ClientSecret;
        credentials: {
          accountName: string;
          tenantId: string;
          clientId: string;
          clientSecret: string;
        };
      }
    | {
        method: AzureBlobStorageConnectionMethod.AccessKey;
        credentials: {
          accountName: string;
          accountKey: string;
        };
      }
  );
