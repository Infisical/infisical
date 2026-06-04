import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  APP_CONNECTION_MAP,
  buildGitHubAppInstallUrl,
  consumeCsrfToken,
  CSRF_TOKEN_STORAGE_KEY,
  generateCsrfToken,
  GITHUB_CONNECTION_FORM_STORAGE_KEY
} from "@app/helpers/appConnections";
import {
  AzureAppConfigurationConnectionMethod,
  AzureClientSecretsConnectionMethod,
  AzureDevOpsConnectionMethod,
  AzureKeyVaultConnectionMethod,
  GitHubConnectionMethod,
  GitLabConnectionMethod,
  HerokuConnectionMethod,
  TAppConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { resolveGitHubAppInstallations, TGitHubAppInstallation } from "@app/hooks/api/gitHubApps";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { FormDataMap } from "./OauthCallbackPage.types";

const formDataStorageFieldMap: Partial<Record<AppConnection, string>> = {
  [AppConnection.GitHub]: GITHUB_CONNECTION_FORM_STORAGE_KEY,
  [AppConnection.GitHubRadar]: "githubRadarConnectionFormData",
  [AppConnection.GitLab]: "gitlabConnectionFormData",
  [AppConnection.AzureKeyVault]: "azureKeyVaultConnectionFormData",
  [AppConnection.AzureAppConfiguration]: "azureAppConfigurationConnectionFormData",
  [AppConnection.AzureClientSecrets]: "azureClientSecretsConnectionFormData",
  [AppConnection.AzureDevOps]: "azureDevOpsConnectionFormData",
  [AppConnection.Heroku]: "herokuConnectionFormData"
};

type TGitHubInstallationPicker = {
  installations: TGitHubAppInstallation[];
  installationsToken: string;
  formData: FormDataMap[AppConnection.GitHub];
};

export const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);

  const [gitHubPicker, setGitHubPicker] = useState<TGitHubInstallationPicker | null>(null);
  const [pickedInstallationId, setPickedInstallationId] = useState<string | null>(null);

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
    if (!consumeCsrfToken(state)) {
      throw new Error("Invalid CSRF token");
    }

    const dataFieldName = formDataStorageFieldMap[app];

    localStorage.removeItem(dataFieldName!);
  };

  // Shared post-success step: notify and navigate back to where the connection flow started.
  const finalizeConnection = async (data: {
    returnUrl: string;
    appConnectionName: string;
    connectionId?: string;
    projectId?: string;
    connection: TAppConnection;
  }) => {
    createNotification({
      text: `Successfully ${data.connectionId ? "updated" : "added"} ${data.appConnectionName ? APP_CONNECTION_MAP[data.appConnectionName as AppConnection].name : ""} Connection`,
      type: "success"
    });

    await navigate({
      to: data.returnUrl,
      params: {
        projectId: data.projectId ?? undefined
      },
      search: data.returnUrl.includes("app-connections")
        ? undefined
        : {
            connectionId: data.connection.id,
            connectionName: data.connection.name,
            ...(data.returnUrl.includes("integrations")
              ? {
                  selectedTab: localStorage.getItem("pkiSyncFormData")
                    ? IntegrationsListPageTabs.PkiSyncs
                    : IntegrationsListPageTabs.SecretSyncs
                }
              : {})
          }
    });
  };

  const getFormData = <T extends keyof FormDataMap>(app: T): FormDataMap[T] | null => {
    const dataFieldName = formDataStorageFieldMap[app];

    const rawData = localStorage.getItem(dataFieldName!);

    if (rawData === null) {
      createNotification({
        type: "error",
        text: `Your ${app ? APP_CONNECTION_MAP[app as AppConnection].name : ""} Connection session has expired or was already completed. Please restart the connection flow.`
      });
      navigate({ to: "/" });
      return null;
    }

    try {
      return {
        ...JSON.parse(rawData),
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

  const handleGitLab = useCallback(async () => {
    const formData = getFormData(AppConnection.GitLab);
    if (formData === null) return null;

    clearState(AppConnection.GitLab);

    const { connectionId, name, description, returnUrl, isUpdate, projectId, credentials } =
      formData;

    let connection: TAppConnection;

    try {
      if (isUpdate && connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.GitLab,
          connectionId,
          credentials: {
            code: code as string,
            instanceUrl: credentials.instanceUrl as string
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.GitLab,
          name,
          description,
          projectId,
          method: GitLabConnectionMethod.OAuth,
          credentials: {
            code: code as string,
            instanceUrl: credentials.instanceUrl as string
          }
        });
      }

      return {
        connectionId,
        returnUrl,
        appConnectionName: formData.app,
        projectId,
        connection
      };
    } catch {
      navigate({
        to: returnUrl,
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

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureKeyVault,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
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
    } catch {
      navigate({
        to: returnUrl,
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
      projectId,
      connection
    };
  }, []);

  const handleAzureAppConfiguration = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureAppConfiguration);
    if (formData === null) return null;

    clearState(AppConnection.AzureAppConfiguration);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureAppConfiguration,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
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
    } catch {
      navigate({
        to: returnUrl,
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
      projectId,
      connection
    };
  }, []);

  const handleAzureClientSecrets = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureClientSecrets);
    if (formData === null) return null;

    clearState(AppConnection.AzureClientSecrets);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureClientSecrets,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
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
    } catch {
      navigate({
        to: returnUrl,
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
      projectId,
      connection
    };
  }, []);

  const handleAzureDevOps = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureDevOps);
    if (formData === null) return null;

    clearState(AppConnection.AzureDevOps);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (!("tenantId" in formData)) {
        throw new Error("Expected OAuth form data but got access token data");
      }

      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureDevOps,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId as string,
            orgName: formData.orgName
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
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
    } catch {
      navigate({
        to: returnUrl,
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
      projectId,
      connection
    };
  }, []);

  const handleGitHub = useCallback(async () => {
    const formData = getFormData(AppConnection.GitHub);
    if (formData === null) return null;

    clearState(AppConnection.GitHub);

    const { connectionId, name, description, returnUrl, gatewayId, credentials, projectId } =
      formData;

    const storedGitHubAppId = (credentials as { gitHubAppId?: string | null } | undefined)
      ?.gitHubAppId;

    if (!installationId && formData.method === GitHubConnectionMethod.App) {
      try {
        const result = await resolveGitHubAppInstallations({
          code: code as string,
          gitHubAppId: storedGitHubAppId ?? undefined,
          ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
          ...(credentials?.host && { host: credentials.host }),
          ...(gatewayId && { gatewayId }),
          ...(projectId && { projectId })
        });
        setGitHubPicker({ ...result, formData });
      } catch (err) {
        createNotification({
          type: "error",
          text:
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Failed to resolve GitHub App installations"
        });
        navigate({
          to: returnUrl,
          params: {
            projectId
          }
        });
      }
      return null;
    }

    let connection: TAppConnection;

    try {
      const gitHubAppId = storedGitHubAppId;
      const isAppMethod = Boolean(installationId);

      const appCredentials = {
        code: code as string,
        ...(installationId && { installationId: installationId as string }),
        ...(gitHubAppId !== undefined && { gitHubAppId }),
        ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
        ...(credentials?.host && { host: credentials.host })
      };

      const oauthCredentials = {
        code: code as string,
        ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
        ...(credentials?.host && { host: credentials.host })
      };

      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          connectionId,
          credentials: isAppMethod ? appCredentials : oauthCredentials,
          gatewayId
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          name,
          description,
          projectId,
          ...(isAppMethod
            ? {
                method: GitHubConnectionMethod.App,
                credentials: appCredentials,
                gatewayId
              }
            : {
                method: GitHubConnectionMethod.OAuth,
                credentials: oauthCredentials,
                gatewayId
              })
        });
      }
    } catch (err) {
      createNotification({
        type: "error",
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          `Failed to ${connectionId ? "update" : "create"} GitHub Connection`
      });
      navigate({
        to: returnUrl,
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
      projectId,
      connection
    };
  }, []);

  const completeGitHubAppConnection = async (selectedInstallationId: string) => {
    if (!gitHubPicker) return;

    const { installationsToken, formData } = gitHubPicker;
    const { connectionId, name, description, returnUrl, gatewayId, credentials, projectId } =
      formData;
    const gitHubAppId = (credentials as { gitHubAppId?: string | null } | undefined)?.gitHubAppId;

    setPickedInstallationId(selectedInstallationId);

    try {
      const appCredentials = {
        installationsToken,
        installationId: selectedInstallationId,
        ...(gitHubAppId !== undefined && { gitHubAppId }),
        ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
        ...(credentials?.host && { host: credentials.host })
      };

      let connection: TAppConnection;

      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          connectionId,
          credentials: appCredentials,
          gatewayId
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          name,
          description,
          projectId,
          method: GitHubConnectionMethod.App,
          credentials: appCredentials,
          gatewayId
        });
      }

      await finalizeConnection({
        connectionId,
        returnUrl,
        appConnectionName: formData.app,
        projectId,
        connection
      });
    } catch (err) {
      createNotification({
        type: "error",
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          `Failed to ${connectionId ? "update" : "create"} GitHub Connection`
      });
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
    }
  };

  const redirectToGitHubInstall = () => {
    if (!gitHubPicker) return;

    const { formData } = gitHubPicker;

    if (!formData.appSlug) {
      createNotification({
        type: "error",
        text: "Unable to determine the GitHub App to install. Please restart the connection flow."
      });
      navigate({
        to: formData.returnUrl,
        params: {
          projectId: formData.projectId
        }
      });
      return;
    }

    const newState = generateCsrfToken();
    localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, newState);
    localStorage.setItem(GITHUB_CONNECTION_FORM_STORAGE_KEY, JSON.stringify(formData));

    window.location.assign(
      buildGitHubAppInstallUrl(
        formData.appSlug,
        newState,
        formData.credentials?.host,
        formData.credentials?.instanceType
      )
    );
  };

  const handleGitHubRadar = useCallback(async () => {
    const formData = getFormData(AppConnection.GitHubRadar);
    if (formData === null) return null;

    clearState(AppConnection.GitHubRadar);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.GitHubRadar,
          connectionId,
          credentials: {
            code: code as string,
            installationId: installationId as string
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
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
    } catch {
      navigate({
        to: returnUrl,
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
      projectId,
      connection
    };
  }, []);

  const handleHeroku = useCallback(async () => {
    const formData = getFormData(AppConnection.Heroku);
    if (formData === null) return null;

    clearState(AppConnection.Heroku);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.Heroku,
          connectionId,
          credentials: {
            code: code as string
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.Heroku,
          name,
          description,
          method: HerokuConnectionMethod.OAuth,
          projectId,
          credentials: {
            code: code as string
          }
        });
      }
    } catch {
      navigate({
        to: returnUrl,
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
      projectId,
      connection
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
        returnUrl: string;
        appConnectionName: string;
        connectionId?: string;
        projectId?: string;
        connection: TAppConnection;
      } | null = null;

      try {
        if (appConnection === AppConnection.GitHub) {
          data = await handleGitHub();
        } else if (appConnection === AppConnection.GitHubRadar) {
          data = await handleGitHubRadar();
        } else if (appConnection === AppConnection.GitLab) {
          data = await handleGitLab();
        } else if (appConnection === AppConnection.AzureKeyVault) {
          data = await handleAzureKeyVault();
        } else if (appConnection === AppConnection.AzureAppConfiguration) {
          data = await handleAzureAppConfiguration();
        } else if (appConnection === AppConnection.AzureClientSecrets) {
          data = await handleAzureClientSecrets();
        } else if (appConnection === AppConnection.AzureDevOps) {
          data = await handleAzureDevOps();
        } else if (appConnection === AppConnection.Heroku) {
          data = await handleHeroku();
        }
      } catch {
        createNotification({
          type: "error",
          text: "Your connection session is invalid or has expired. Please restart the connection flow."
        });
        await navigate({ to: "/" });
        return;
      }

      if (data) {
        await finalizeConnection(data);
      }
    })();
  }, [isReady]);

  if (gitHubPicker) {
    const hasInstallations = gitHubPicker.installations.length > 0;

    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="w-full max-w-md rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6">
          <div className="mb-1 text-lg font-medium text-mineshaft-100">
            {hasInstallations ? "Select a GitHub account" : "Install the GitHub App"}
          </div>
          <p className="mb-4 text-sm text-mineshaft-300">
            {hasInstallations
              ? "The GitHub App is already installed on the following accounts. Select the installation to connect, or install the app on another account."
              : "The GitHub App is not installed on any account you have access to. Install it to continue."}
          </p>
          {hasInstallations && (
            <div className="mb-4 flex flex-col gap-2">
              {gitHubPicker.installations.map((installation) => (
                <Button
                  key={installation.id}
                  variant="outline_bg"
                  isFullWidth
                  isDisabled={Boolean(pickedInstallationId)}
                  isLoading={pickedInstallationId === installation.id}
                  onClick={() => completeGitHubAppConnection(installation.id)}
                >
                  <div className="flex w-full items-center justify-between">
                    <span>{installation.accountLogin}</span>
                    <span className="text-xs text-mineshaft-400">{installation.accountType}</span>
                  </div>
                </Button>
              ))}
            </div>
          )}
          <Button
            variant={hasInstallations ? "plain" : "outline_bg"}
            isFullWidth
            isDisabled={Boolean(pickedInstallationId)}
            onClick={redirectToGitHubInstall}
          >
            {hasInstallations ? "Install on another account" : "Install GitHub App"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Please wait! Authentication in process." />
    </div>
  );
};
