import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum GiteaConnectionMethod {
  OAuth = "oauth",
  PersonalAccessToken = "personal-access-token"
}

export type TGiteaConnection = TRootAppConnection & { app: AppConnection.Gitea } & (
    | {
        method: GiteaConnectionMethod.OAuth;
        credentials: {
          instanceUrl: string;
          code: string;
        };
      }
    | {
        method: GiteaConnectionMethod.PersonalAccessToken;
        credentials: {
          instanceUrl: string;
          personalAccessToken: string;
        };
      }
  );
