import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  AzureAppConfigurationConnectionMethod,
  AzureClientSecretsConnectionMethod,
  AzureKeyVaultConnectionMethod,
  GitHubConnectionMethod,
  TAzureAppConfigurationConnection,
  TAzureClientSecretsConnection,
  TAzureKeyVaultConnection,
  TGitHubConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type BaseFormData = {
  returnUrl?: string;
  connectionId?: string;
};

type GithubFormData = BaseFormData & Pick<TGitHubConnection, "name" | "method" | "description">;

type AzureKeyVaultFormData = BaseFormData &
  Pick<TAzureKeyVaultConnection, "name" | "method" | "description"> &
  Pick<TAzureKeyVaultConnection["credentials"], "tenantId">;

type AzureAppConfigurationFormData = BaseFormData &
  Pick<TAzureAppConfigurationConnection, "name" | "method" | "description"> &
  Pick<TAzureAppConfigurationConnection["credentials"], "tenantId">;

type AzureClientSecretsFormData = BaseFormData &
  Pick<TAzureClientSecretsConnection, "name" | "method" | "description"> &
  Pick<TAzureClientSecretsConnection["credentials"], "tenantId">;

type FormDataMap = {
  [AppConnection.GitHub]: GithubFormData & { app: AppConnection.GitHub };
  [AppConnection.AzureKeyVault]: AzureKeyVaultFormData & { app: AppConnection.AzureKeyVault };
  [AppConnection.AzureAppConfiguration]: AzureAppConfigurationFormData & {
    app: AppConnection.AzureAppConfiguration;
  };
  [AppConnection.AzureClientSecrets]: AzureClientSecretsFormData & {
    app: AppConnection.AzureClientSecrets;
  };
};

const formDataStorageFieldMap: Partial<Record<AppConnection, string>> = {
  [AppConnection.GitHub]: "githubConnectionFormData",
  [AppConnection.AzureKeyVault]: "azureKeyVaultConnectionFormData",
  [AppConnection.AzureAppConfiguration]: "azureAppConfigurationConnectionFormData",
  [AppConnection.AzureClientSecrets]: "azureClientSecretsConnectionFormData"
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

  const handleAzureKeyVault = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureKeyVault);
    if (formData === null) return null;

    clearState(AppConnection.AzureKeyVault);

    const { connectionId, name, description, returnUrl } = formData;

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
        to: returnUrl ?? "/organization/app-connections"
      });
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app
    };
  }, []);

  const handleAzureAppConfiguration = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureAppConfiguration);
    if (formData === null) return null;

    clearState(AppConnection.AzureAppConfiguration);

    const { connectionId, name, description, returnUrl } = formData;

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
        to: returnUrl ?? "/organization/app-connections"
      });
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app
    };
  }, []);

  const handleAzureClientSecrets = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureClientSecrets);
    if (formData === null) return null;

    clearState(AppConnection.AzureClientSecrets);

    const { connectionId, name, description, returnUrl } = formData;

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
        to: returnUrl ?? "/organization/app-connections"
      });
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app
    };
  }, []);

  const handleGithub = useCallback(async () => {
    const formData = getFormData(AppConnection.GitHub);
    if (formData === null) return null;

    clearState(AppConnection.GitHub);

    const { connectionId, name, description, returnUrl } = formData;

    try {
      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          ...(installationId
            ? {
                connectionId,
                credentials: {
                  code: code as string,
                  installationId: installationId as string
                }
              }
            : {
                connectionId,
                credentials: {
                  code: code as string
                }
              })
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          name,
          description,
          ...(installationId
            ? {
                method: GitHubConnectionMethod.App,
                credentials: {
                  code: code as string,
                  installationId: installationId as string
                }
              }
            : {
                method: GitHubConnectionMethod.OAuth,
                credentials: {
                  code: code as string
                }
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
        to: returnUrl ?? "/organization/app-connections"
      });
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app
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
      let data: { connectionId?: string; returnUrl?: string; appConnectionName?: string } | null =
        null;

      if (appConnection === AppConnection.GitHub) {
        data = await handleGithub();
      } else if (appConnection === AppConnection.AzureKeyVault) {
        data = await handleAzureKeyVault();
      } else if (appConnection === AppConnection.AzureAppConfiguration) {
        data = await handleAzureAppConfiguration();
      } else if (appConnection === AppConnection.AzureClientSecrets) {
        data = await handleAzureClientSecrets();
      }

      if (data) {
        createNotification({
          text: `Successfully ${data.connectionId ? "updated" : "added"} ${data.appConnectionName ? APP_CONNECTION_MAP[data.appConnectionName as AppConnection].name : ""} Connection`,
          type: "success"
        });
      } else {
        createNotification({
          text: "Failed to add connection",
          type: "error"
        });
      }

      await navigate({
        to: data?.returnUrl ?? "/organization/app-connections"
      });
    })();
  }, [isReady]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Please wait! Authentication in process." />
    </div>
  );
};
