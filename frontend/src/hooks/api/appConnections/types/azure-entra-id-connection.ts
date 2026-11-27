import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TAzureFederatedCredential } from "@app/hooks/api/appConnections/types/azure-federated-credential";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureEntraIdConnectionMethod {
  ClientSecret = "client-secret",
  ManagedIdentity = "managed-identity"
}

export type TAzureEntraIdConnection = TRootAppConnection & {
  app: AppConnection.AzureEntraId;
} & (
    | {
        method: AzureEntraIdConnectionMethod.ClientSecret;
        credentials: {
          clientId: string;
          clientSecret: string;
          tenantId: string;
        };
      }
    | {
        method: AzureEntraIdConnectionMethod.ManagedIdentity;
        credentials: {
          clientId: string;
          tenantId: string;
          federatedCredential?: TAzureFederatedCredential;
        };
      }
  );
