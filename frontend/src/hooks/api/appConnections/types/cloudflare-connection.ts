import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum CloudflareConnectionMethod {
  ApiToken = "api-token"
}

export type TCloudflareConnection = TRootAppConnection & { app: AppConnection.Cloudflare } & {
  method: CloudflareConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
    accountId: string;
  };
};
