import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum TerraformCloudConnectionMethod {
  ApiToken = "api-token"
}

export type TTerraformCloudConnection = TRootAppConnection & {
  app: AppConnection.TerraformCloud;
} & {
  method: TerraformCloudConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
