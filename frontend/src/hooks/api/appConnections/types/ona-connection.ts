import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OnaConnectionMethod {
  PersonalAccessToken = "personal-access-token"
}

export type TOnaConnection = TRootAppConnection & { app: AppConnection.Ona } & {
  method: OnaConnectionMethod.PersonalAccessToken;
  credentials: {
    personalAccessToken: string;
  };
};
