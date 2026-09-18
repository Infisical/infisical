import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ConvexConnectionMethod {
  PersonalAccessToken = "personal-access-token"
}

export type TConvexConnection = TRootAppConnection & { app: AppConnection.Convex } & {
  method: ConvexConnectionMethod.PersonalAccessToken;
  credentials: {
    accessToken: string;
    instanceUrl?: string;
  };
};
