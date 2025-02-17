import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureAppConfigurationConnectionMethod {
  OAuth = "oauth"
}

export type TAzureAppConfigurationConnection = TRootAppConnection & {
  app: AppConnection.AzureAppConfiguration;
} & {
  method: AzureAppConfigurationConnectionMethod.OAuth;
  credentials: {
    code: string;
    tenantId?: string;
  };
};
