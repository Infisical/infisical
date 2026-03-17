import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureEntraIdConnectionMethod {
  ClientSecret = "client-secret"
}

export type TAzureEntraIdConnection = TRootAppConnection & {
  app: AppConnection.AzureEntraId;
} & {
  method: AzureEntraIdConnectionMethod.ClientSecret;
  credentials: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
  };
};
