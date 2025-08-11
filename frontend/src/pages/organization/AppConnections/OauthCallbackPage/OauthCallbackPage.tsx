import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  AzureAppConfigurationConnectionMethod,
  AzureClientSecretsConnectionMethod,
  AzureDevOpsConnectionMethod,
  AzureKeyVaultConnectionMethod,
  GitHubConnectionMethod,
  GitLabConnectionMethod,
  TAzureAppConfigurationConnection,
  TAzureClientSecretsConnection,
  TAzureDevOpsConnection,
  TAzureKeyVaultConnection,
  TGitHubConnection,
  TGitHubRadarConnection,
  TGitLabConnection,
  useCreateAppConnection,
  useUpdateAppConnection
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
  Pick<TGitLabConnection, "name" | "method" | "description">;

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

type FormDataMap = {
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

const formDataStorageFieldMap: Partial<Record<AppConnection, string>> = {
  [AppConnection.GitHub]: "githubConnectionFormData",
  [AppConnection.GitHubRadar]: "githubRadarConnectionFormData",
  [AppConnection.GitLab]: "gitlabConnectionFormData",
  [AppConnection.AzureKeyVault]: "azureKeyVaultConnectionFormData",
  [AppConnection.AzureAppConfiguration]: "azureAppConfigurationConnectionFormData",
  [AppConnection.AzureClientSecrets]: "azureClientSecretsConnectionFormData",
  [AppConnection.AzureDevOps]: "azureDevOpsConnectionFormData"
};

export const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);

  const search = useSearch({
    from: ROUTE_PATHS.Organization.AppConnections.OauthCallbackPage.id
  });

  const rawAppConnection = useParams({
    strict: false,
    select: (el) => el?.appConnection as AppConnection
  });

  const updateAppConnection = useUpdateAppConnection();
  const createAppConnection = useCreateAppConnection();

  const { code, state: rawState, installation_id: installationId } = search;

  const state = rawState.includes("<:>") ? rawState.split("<:>")[0] : rawState;
  const appConnection = rawState.includes("<:>") ? rawState.split("<:>")[1] : rawAppConnection;

  const clearState = (app: AppConnection) => {
    if (state !== localStorage.getItem("latestCSRFToken")) {
      throw new Error("Invalid CSRF token");
    }

    const dataFieldName = formDataStorageFieldMap[app];

    localStorage.removeItem(dataFieldName!);
    localStorage.removeItem("latestCSRFToken");
  };

  const getFormData = <T extends keyof FormDataMap>(app: T): FormDataMap[T] | null => {
    const dataFieldName = formDataStorageFieldMap[app];

    try {
      const rawData = JSON.parse(localStorage.getItem(dataFieldName!) ?? "{}");

      return {
        ...rawData,
        app
      } as FormDataMap[T];
    } catch {
      createNotification({
        type: "error",
        text: `Invalid ${app || ""} form state, redirecting...`
      });
      navigate({ to: "/" });
      return null;
    }
  };

  const handleGitlab = useCallback(async () => {
    const formData = getFormData(AppConnection.GitLab);
    if (formData === null) return null;

    clearState(AppConnection.GitLab);

    const { connectionId, name, description, returnUrl, isUpdate, projectId } = formData;

    try {
      if (isUpdate && connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.GitLab,
          connectionId,
          credentials: {
            code: code as string
          }
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.GitLab,
          name,
          description,
          projectId,
          method: GitLabConnectionMethod.OAuth,
          credentials: {
            code: code as string
          }
        });
      }

      return {
        connectionId,
        returnUrl,
        appConnectionName: formData.app,
        projectId
      };
    } catch (err: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} GitLab Connection`,
        text: err?.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/app-connections",
        params: {
          projectId
        }
      });
      return null;
    }
  }, []);

  const handleAzureKeyVault = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureKeyVault);
    if (formData === null) return null;

    clearState(AppConnection.AzureKeyVault);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    try {
      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.AzureKeyVault,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.AzureKeyVault,
          name,
          description,
          projectId,
          method: AzureKeyVaultConnectionMethod.OAuth,
          credentials: {
            tenantId: formData.tenantId,
            code: code as string
          }
        });
      }
    } catch (err: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} Azure Key Vault Connection`,
        text: err?.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/app-connections",
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId
    };
  }, []);

  const handleAzureAppConfiguration = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureAppConfiguration);
    if (formData === null) return null;

    clearState(AppConnection.AzureAppConfiguration);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    try {
      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.AzureAppConfiguration,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.AzureAppConfiguration,
          name,
          description,
          projectId,
          method: AzureAppConfigurationConnectionMethod.OAuth,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      }
    } catch (err: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} Azure App Configuration Connection`,
        text: err?.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/app-connections",
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId
    };
  }, []);

  const handleAzureClientSecrets = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureClientSecrets);
    if (formData === null) return null;

    clearState(AppConnection.AzureClientSecrets);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    try {
      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.AzureClientSecrets,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.AzureClientSecrets,
          name,
          description,
          method: AzureClientSecretsConnectionMethod.OAuth,
          projectId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      }
    } catch (err: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} Azure Client Secrets Connection`,
        text: err?.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/app-connections",
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId
    };
  }, []);

  const handleAzureDevOps = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureDevOps);
    if (formData === null) return null;

    clearState(AppConnection.AzureDevOps);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    try {
      if (!("tenantId" in formData)) {
        throw new Error("Expected OAuth form data but got access token data");
      }

      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.AzureDevOps,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId as string,
            orgName: formData.orgName
          }
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.AzureDevOps,
          name,
          description,
          method: AzureDevOpsConnectionMethod.OAuth,
          projectId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId as string,
            orgName: formData.orgName
          }
        });
      }
    } catch (err: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} Azure DevOps Connection`,
        text: err?.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/app-connections",
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId
    };
  }, []);

  const handleGithub = useCallback(async () => {
    const formData = getFormData(AppConnection.GitHub);
    if (formData === null) return null;

    clearState(AppConnection.GitHub);

    const { connectionId, name, description, returnUrl, gatewayId, credentials, projectId } =
      formData;

    try {
      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          ...(installationId
            ? {
                connectionId,
                credentials: {
                  code: code as string,
                  installationId: installationId as string,
                  ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
                  ...(credentials?.host && { host: credentials.host })
                },
                gatewayId
              }
            : {
                connectionId,
                credentials: {
                  code: code as string,
                  ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
                  ...(credentials?.host && { host: credentials.host })
                },
                gatewayId
              })
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          name,
          description,
          projectId,
          ...(installationId
            ? {
                method: GitHubConnectionMethod.App,
                credentials: {
                  code: code as string,
                  ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
                  installationId: installationId as string,
                  ...(credentials?.host && { host: credentials.host })
                },
                gatewayId
              }
            : {
                method: GitHubConnectionMethod.OAuth,
                credentials: {
                  code: code as string,
                  ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
                  ...(credentials?.host && { host: credentials.host })
                },
                gatewayId
              })
        });
      }
    } catch (e: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} GitHub Connection`,
        text: e.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/app-connections",
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId
    };
  }, []);

  const handleGithubRadar = useCallback(async () => {
    const formData = getFormData(AppConnection.GitHubRadar);
    if (formData === null) return null;

    clearState(AppConnection.GitHubRadar);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    try {
      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.GitHubRadar,
          connectionId,
          credentials: {
            code: code as string,
            installationId: installationId as string
          }
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.GitHubRadar,
          name,
          description,
          method: GitHubConnectionMethod.App,
          projectId,
          credentials: {
            code: code as string,
            installationId: installationId as string
          }
        });
      }
    } catch (e: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} GitHub Radar Connection`,
        text: e.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/app-connections",
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId
    };
  }, []);

  // Ensure that the localstorage is ready for use, to avoid the form data being malformed
  useEffect(() => {
    if (!isReady) {
      setIsReady(!!localStorage.length);
    }
  }, [localStorage.length]);

  useEffect(() => {
    if (!isReady) return;

    (async () => {
      let data: {
        connectionId?: string;
        returnUrl?: string;
        appConnectionName?: string;
        projectId?: string;
      } | null = null;

      if (appConnection === AppConnection.GitHub) {
        data = await handleGithub();
      } else if (appConnection === AppConnection.GitHubRadar) {
        data = await handleGithubRadar();
      } else if (appConnection === AppConnection.GitLab) {
        data = await handleGitlab();
      } else if (appConnection === AppConnection.AzureKeyVault) {
        data = await handleAzureKeyVault();
      } else if (appConnection === AppConnection.AzureAppConfiguration) {
        data = await handleAzureAppConfiguration();
      } else if (appConnection === AppConnection.AzureClientSecrets) {
        data = await handleAzureClientSecrets();
      } else if (appConnection === AppConnection.AzureDevOps) {
        data = await handleAzureDevOps();
      }

      if (data) {
        createNotification({
          text: `Successfully ${data.connectionId ? "updated" : "added"} ${data.appConnectionName ? APP_CONNECTION_MAP[data.appConnectionName as AppConnection].name : ""} Connection`,
          type: "success"
        });

        await navigate({
          to: data.returnUrl ?? "/organization/app-connections",
          params: {
            projectId: data.projectId
          }
        });
      }
    })();
  }, [isReady]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Please wait! Authentication in process." />
    </div>
  );
};
