import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TAppConnectionOption } from "@app/hooks/api/appConnections/types/app-options";
import { TAwsConnection } from "@app/hooks/api/appConnections/types/aws-connection";
import { TGitHubConnection } from "@app/hooks/api/appConnections/types/github-connection";

import { AzureResources, TAzureConnection } from "./azure-connection";
import { TGcpConnection } from "./gcp-connection";

export * from "./aws-connection";
export * from "./azure-connection";
export * from "./gcp-connection";
export * from "./github-connection";

export type TAppConnection = TAwsConnection | TGitHubConnection | TGcpConnection | TAzureConnection;

export type TAvailableAppConnection =
  | (Pick<TAppConnection, "name" | "id"> & { app: Exclude<AppConnection, AppConnection.Azure> })
  | (Pick<TAppConnection, "name" | "id"> & {
      app: AppConnection.Azure;
      azureResource?: AzureResources;
    });

export type TListAppConnections<T extends TAppConnection> = { appConnections: T[] };
export type TGetAppConnection<T extends TAppConnection> = { appConnection: T };
export type TAppConnectionOptions = { appConnectionOptions: TAppConnectionOption[] };
export type TAppConnectionResponse = { appConnection: TAppConnection };
export type TAvailableAppConnectionsResponse = { appConnections: TAvailableAppConnection[] };

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
  [AppConnection.GCP]: TGcpConnection;
  [AppConnection.Azure]: TAzureConnection;
};
