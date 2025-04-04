import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum TerraformCloudConnectionMethod {
  API_TOKEN = "api-token"
}

export type TTerraformCloudConnection = TRootAppConnection & {
  app: AppConnection.TerraformCloud;
} & {
  method: TerraformCloudConnectionMethod.API_TOKEN;
  credentials: {
    apiToken: string;
  };
};
