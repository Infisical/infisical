import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureConnectionMethod {
  OAuth = "oauth"
}

export enum AzureResources {
  KeyVault = "key-vault",
  AppConfiguration = "app-configuration"
}

export const azureResourcesMap: Record<AzureResources, string> = {
  [AzureResources.AppConfiguration]: "App Configuration",
  [AzureResources.KeyVault]: "Key Vault"
};

export type TAzureConnection = TRootAppConnection & { app: AppConnection.Azure } & {
  method: AzureConnectionMethod.OAuth;
  resource: AzureResources;
  credentials: {
    code: string;
    tenantId?: string;
    resource: AzureResources;
  };
};
