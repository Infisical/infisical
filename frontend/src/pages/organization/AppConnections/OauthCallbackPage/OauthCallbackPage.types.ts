import {
  AzureDevOpsConnectionMethod,
  TAzureAppConfigurationConnection,
  TAzureClientSecretsConnection,
  TAzureDevOpsConnection,
  TAzureKeyVaultConnection,
  TGitHubConnection,
  TGitHubRadarConnection,
  TGitLabConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type BaseFormData = {
  returnUrl: string;
  connectionId?: string;
  isUpdate?: boolean;
  projectId: string;
};

export type GithubFormData = BaseFormData &
  Pick<TGitHubConnection, "name" | "method" | "description" | "gatewayId" | "credentials">;

export type GithubRadarFormData = BaseFormData &
  Pick<TGitHubRadarConnection, "name" | "method" | "description">;

export type GitLabFormData = BaseFormData &
  Pick<TGitLabConnection, "name" | "method" | "description" | "credentials">;

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

export type FormDataMap = {
  [AppConnection.GitHub]: GithubFormData & { app: AppConnection.GitHub };
  [AppConnection.GitHubRadar]: GithubRadarFormData & { app: AppConnection.GitHubRadar };
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
};
