import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TAppConnectionOption } from "@app/hooks/api/appConnections/types/app-options";
import { TAwsConnection } from "@app/hooks/api/appConnections/types/aws-connection";
import { TGitHubConnection } from "@app/hooks/api/appConnections/types/github-connection";

export * from "./aws-connection";
export * from "./github-connection";

export type TAppConnection = TAwsConnection | TGitHubConnection;

export type TListAppConnections<T extends TAppConnection> = { appConnections: T[] };
export type TGetAppConnection<T extends TAppConnection> = { appConnection: T };
export type TAppConnectionOptions = { appConnectionOptions: TAppConnectionOption[] };
export type TAppConnectionResponse = { appConnection: TAppConnection };

export type TCreateAppConnectionDTO = Pick<
  TAppConnection,
  "name" | "credentials" | "method" | "app" | "description"
>;

export type TUpdateAppConnectionDTO = Partial<
  Pick<TAppConnection, "name" | "credentials" | "description">
> & {
  connectionId: string;
  app: AppConnection;
};

export type TDeleteAppConnectionDTO = {
  app: AppConnection;
  connectionId: string;
};

export type TAppConnectionMap = {
  [AppConnection.AWS]: TAwsConnection;
  [AppConnection.GitHub]: TGitHubConnection;
};
