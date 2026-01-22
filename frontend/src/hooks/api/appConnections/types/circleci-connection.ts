import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum CircleCIConnectionMethod {
  PersonalAccessToken = "personal-access-token"
}

export type TCircleCIConnection = TRootAppConnection & { app: AppConnection.CircleCI } & {
  method: CircleCIConnectionMethod.PersonalAccessToken;
  credentials: {
    apiToken: string;
  };
};
