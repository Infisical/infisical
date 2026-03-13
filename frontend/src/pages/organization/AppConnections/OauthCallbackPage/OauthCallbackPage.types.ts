import {
  AzureDevOpsConnectionMethod,
  TAzureAppConfigurationConnection,
  TAzureClientSecretsConnection,
  TAzureDevOpsConnection,
  TAzureKeyVaultConnection,
  TGitHubConnection,
  TGitHubRadarConnection,
  TGitLabConnection,
  THerokuConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type BaseFormData = {
  returnUrl: string;
  connectionId?: string;
  isUpdate?: boolean;
  projectId: string;
};

export type GitHubFormData = BaseFormData &
  Pick<TGitHubConnection, "name" | "method" | "description" | "gatewayId" | "credentials">;

export type GitHubRadarFormData = BaseFormData &
  Pick<TGitHubRadarConnection, "name" | "method" | "description">;

export type GitLabFormData = BaseFormData &
  Pick<TGitLabConnection, "name" | "method" | "description"> & {
    credentials: {
      code: string;
      instanceUrl?: string;
    }
  };

export type AzureKeyVaultFormData = BaseFormData &
  Pick<TAzureKeyVaultConnection, "name" | "method" | "description"> &
  Pick<TAzureKeyVaultConnection["credentials"], "tenantId">;

export type AzureAppConfigurationFormData = BaseFormData &
  Pick<TAzureAppConfigurationConnection, "name" | "method" | "description"> &
  Pick<TAzureAppConfigurationConnection["credentials"], "tenantId">;

export type AzureClientSecretsFormData = BaseFormData &
  Pick<TAzureClientSecretsConnection, "name" | "method" | "description"> &
  Pick<TAzureClientSecretsConnection["credentials"], "tenantId">;

type OAuthCredentials = Extract<
  TAzureDevOpsConnection,
  { method: AzureDevOpsConnectionMethod.OAuth }
>["credentials"];
type AccessTokenCredentials = Extract<
  TAzureDevOpsConnection,
  { method: AzureDevOpsConnectionMethod.AccessToken }
>["credentials"];

export type AzureDevOpsFormData = BaseFormData &
  Pick<TAzureDevOpsConnection, "name" | "method" | "description"> &
  (Pick<OAuthCredentials, "tenantId" | "orgName"> | Pick<AccessTokenCredentials, "orgName">);

export type HerokuFormData = BaseFormData &
  Pick<THerokuConnection, "name" | "method" | "description">;

export type FormDataMap = {
  [AppConnection.GitHub]: GitHubFormData & { app: AppConnection.GitHub };
  [AppConnection.GitHubRadar]: GitHubRadarFormData & { app: AppConnection.GitHubRadar };
  [AppConnection.GitLab]: GitLabFormData & { app: AppConnection.GitLab };
  [AppConnection.AzureKeyVault]: AzureKeyVaultFormData & { app: AppConnection.AzureKeyVault };
  [AppConnection.AzureAppConfiguration]: AzureAppConfigurationFormData & {
    app: AppConnection.AzureAppConfiguration;
  };
  [AppConnection.AzureClientSecrets]: AzureClientSecretsFormData & {
    app: AppConnection.AzureClientSecrets;
  };
  [AppConnection.AzureDevOps]: AzureDevOpsFormData & {
    app: AppConnection.AzureDevOps;
  };
  [AppConnection.Heroku]: HerokuFormData & {
    app: AppConnection.Heroku;
  };
};
