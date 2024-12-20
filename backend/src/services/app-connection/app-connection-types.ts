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

export type TAppConnection = { id: string } & (TAwsConnection | TGitHubConnection);

export type TAppConnectionInput = { id: string } & (TAwsConnectionInput | TGitHubConnectionInput);

export type TCreateAppConnectionDTO = Pick<
  TAppConnectionInput,
  "credentials" | "method" | "name" | "app" | "description"
>;

export type TUpdateAppConnectionDTO = Partial<Omit<TCreateAppConnectionDTO, "method" | "app">> & {
  connectionId: string;
};

export type TAppConnectionConfig = TAwsConnectionConfig | TGitHubConnectionConfig;

export type TValidateAppConnectionCredentials =
  | TValidateAwsConnectionCredentials
  | TValidateGitHubConnectionCredentials;
