import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum VercelConnectionMethod {
  API_TOKEN = "api-token"
}

export type TVercelConnection = TRootAppConnection & { app: AppConnection.Vercel } & {
  method: VercelConnectionMethod.API_TOKEN;
  credentials: {
    apiToken: string;
  };
};
