import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum HerokuConnectionMethod {
  AuthToken = "auth-token",
  OAuth = "oauth"
}

export type THerokuConnection = TRootAppConnection & { app: AppConnection.Heroku } & (
    | {
        method: HerokuConnectionMethod.AuthToken;
        credentials: {
          authToken: string;
        };
      }
    | {
        method: HerokuConnectionMethod.OAuth;
        credentials: {
          code: string;
        };
      }
  );
