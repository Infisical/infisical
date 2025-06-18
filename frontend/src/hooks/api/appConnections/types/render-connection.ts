import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum RenderConnectionMethod {
  ApiKey = "api-key"
}

export type TRenderConnection = TRootAppConnection & { app: AppConnection.Render } & {
  method: RenderConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
