import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureKeyVaultConnectionMethod {
  OAuth = "oauth",
  ClientSecret = "client-secret"
}

export type TAzureKeyVaultConnection = TRootAppConnection & { app: AppConnection.AzureKeyVault } & (
    | {
        method: AzureKeyVaultConnectionMethod.OAuth;
        credentials: {
          code: string;
          tenantId?: string;
        };
      }
    | {
        method: AzureKeyVaultConnectionMethod.ClientSecret;
        credentials: {
          clientId: string;
          clientSecret: string;
          tenantId: string;
        };
      }
  );
