import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureAppConfigurationConnectionMethod {
  OAuth = "oauth",
  ClientSecret = "client-secret"
}

export type TAzureAppConfigurationConnection = TRootAppConnection & {
  app: AppConnection.AzureAppConfiguration;
} & (
    | {
        method: AzureAppConfigurationConnectionMethod.OAuth;
        credentials: {
          code: string;
          tenantId?: string;
        };
      }
    | {
        method: AzureAppConfigurationConnectionMethod.ClientSecret;
        credentials: {
          clientId: string;
          clientSecret: string;
          tenantId: string;
        };
      }
  );
