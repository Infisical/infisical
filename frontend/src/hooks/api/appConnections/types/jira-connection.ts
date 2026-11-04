import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum JiraConnectionMethod {
  ApiToken = "api-token",
  PersonalAccessToken = "personal-access-token"
}

export type TJiraConnection = TRootAppConnection & { app: AppConnection.Jira } & (
    | {
        method: JiraConnectionMethod.ApiToken;
        credentials: {
          instanceUrl: string;
          email: string;
          apiToken: string;
        };
      }
    | {
        method: JiraConnectionMethod.PersonalAccessToken;
        credentials: {
          instanceUrl: string;
          personalAccessToken: string;
          sslRejectUnauthorized?: boolean;
          sslCertificate?: string;
        };
      }
  );
