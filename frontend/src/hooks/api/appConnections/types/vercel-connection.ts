import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum VercelConnectionMethod {
  ApiToken = "api-token"
}

export type TVercelConnection = TRootAppConnection & { app: AppConnection.Vercel } & {
  method: VercelConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
