import {
  TAwsConnection,
  TAwsConnectionConfig,
  TAwsConnectionInput,
  TValidateAwsConnectionCredentials
} from "@app/services/app-connection/aws";
import {
  TGitHubConnection,
  TGitHubConnectionConfig,
  TGitHubConnectionInput,
  TValidateGitHubConnectionCredentials
} from "@app/services/app-connection/github";

import { TGcpConnection, TGcpConnectionConfig, TGcpConnectionInput, TValidateGcpConnectionCredentials } from "./gcp";

export type TAppConnection = { id: string } & (TAwsConnection | TGitHubConnection | TGcpConnection);

export type TAppConnectionInput = { id: string } & (TAwsConnectionInput | TGitHubConnectionInput | TGcpConnectionInput);

export type TCreateAppConnectionDTO = Pick<
  TAppConnectionInput,
  "credentials" | "method" | "name" | "app" | "description"
>;

export type TUpdateAppConnectionDTO = Partial<Omit<TCreateAppConnectionDTO, "method" | "app">> & {
  connectionId: string;
};

export type TAppConnectionConfig = TAwsConnectionConfig | TGitHubConnectionConfig | TGcpConnectionConfig;

export type TValidateAppConnectionCredentials =
  | TValidateAwsConnectionCredentials
  | TValidateGitHubConnectionCredentials
  | TValidateGcpConnectionCredentials;
