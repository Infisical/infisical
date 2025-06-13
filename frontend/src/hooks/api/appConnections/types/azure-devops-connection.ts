import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureDevOpsConnectionMethod {
  OAuth = "oauth",
  AccessToken = "access-token"
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
  );
