import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum LaravelForgeConnectionMethod {
  ApiToken = "api-token"
}

export type TLaravelForgeConnection = TRootAppConnection & { app: AppConnection.LaravelForge } & {
  method: LaravelForgeConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
