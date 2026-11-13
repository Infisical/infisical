import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DenoDeployConnectionMethod {
  AccessToken = "access-token"
}

export type TDenoDeployConnection = TRootAppConnection & { app: AppConnection.DenoDeploy } & {
  method: DenoDeployConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
    organizationId?: string;
  };
};
