import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TAzureFederatedCredential } from "@app/hooks/api/appConnections/types/azure-federated-credential";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureDevOpsConnectionMethod {
  OAuth = "oauth",
  AccessToken = "access-token",
  ClientSecret = "client-secret",
  ManagedIdentity = "managed-identity"
}

export type TAzureDevOpsConnection = TRootAppConnection & {
  app: AppConnection.AzureDevOps;
} & (
    | {
        method: AzureDevOpsConnectionMethod.OAuth;
        credentials: {
          code: string;
          tenantId: string;
          orgName: string;
        };
      }
    | {
        method: AzureDevOpsConnectionMethod.AccessToken;
        credentials: {
          accessToken: string;
          orgName: string;
        };
      }
    | {
        method: AzureDevOpsConnectionMethod.ClientSecret;
        credentials: {
          clientSecret: string;
          tenantId: string;
          clientId: string;
          orgName: string;
        };
      }
    | {
        method: AzureDevOpsConnectionMethod.ManagedIdentity;
        credentials: {
          clientId: string;
          tenantId: string;
          orgName: string;
          federatedCredential?: TAzureFederatedCredential;
        };
      }
  );
