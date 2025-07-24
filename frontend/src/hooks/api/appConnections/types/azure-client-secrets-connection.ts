import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureClientSecretsConnectionMethod {
  OAuth = "oauth",
  ClientSecret = "client-secret"
}

export type TAzureClientSecretsConnection = TRootAppConnection & {
  app: AppConnection.AzureClientSecrets;
} & (
    | {
        method: AzureClientSecretsConnectionMethod.OAuth;
        credentials: {
          code: string;
          tenantId: string;
        };
      }
    | {
        method: AzureClientSecretsConnectionMethod.ClientSecret;
        credentials: {
          clientSecret: string;
          clientId: string;
          tenantId: string;
        };
      }
  );
