import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureClientSecretsConnectionMethod {
  OAuth = "oauth"
}

export type TAzureClientSecretsConnection = TRootAppConnection & {
  app: AppConnection.AzureClientSecrets;
} & {
  method: AzureClientSecretsConnectionMethod.OAuth;
  credentials: {
    code: string;
    tenantId: string;
  };
};
