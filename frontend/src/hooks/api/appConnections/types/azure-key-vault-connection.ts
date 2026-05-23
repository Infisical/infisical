import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureKeyVaultConnectionMethod {
  OAuth = "oauth",
  ClientSecret = "client-secret",
  Certificate = "certificate"
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
    | {
        method: AzureKeyVaultConnectionMethod.Certificate;
        credentials: {
          clientId: string;
          tenantId: string;
          certificateBody: string;
          privateKey: string;
        };
      }
  );
