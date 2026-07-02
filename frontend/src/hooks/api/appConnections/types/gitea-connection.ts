import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum GiteaConnectionMethod {
  PersonalAccessToken = "personal-access-token"
}

export type TGiteaConnection = TRootAppConnection & { app: AppConnection.Gitea } & {
  method: GiteaConnectionMethod.PersonalAccessToken;
  credentials: {
    instanceUrl: string;
    personalAccessToken: string;
  };
};
