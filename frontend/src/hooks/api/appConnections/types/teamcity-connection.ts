import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum TeamCityConnectionMethod {
  AccessToken = "access-token"
}

export type TTeamCityConnection = TRootAppConnection & { app: AppConnection.TeamCity } & {
  method: TeamCityConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
    instanceUrl: string;
  };
};
