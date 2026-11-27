import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TAzureFederatedCredential } from "@app/hooks/api/appConnections/types/azure-federated-credential";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureDNSConnectionMethod {
  ClientSecret = "client-secret",
  ManagedIdentity = "managed-identity"
}

export type TAzureDNSConnection = TRootAppConnection & { app: AppConnection.AzureDNS } & (
    | {
        method: AzureDNSConnectionMethod.ClientSecret;
        credentials: {
          tenantId: string;
          clientId: string;
          subscriptionId: string;
        };
      }
    | {
        method: AzureDNSConnectionMethod.ManagedIdentity;
        credentials: {
          tenantId: string;
          clientId: string;
          subscriptionId: string;
          federatedCredential?: TAzureFederatedCredential;
        };
      }
  );
