import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  AzureConnectionMethod,
  AzureResources,
  GitHubConnectionMethod,
  TGitHubConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type GithubFormData = Pick<TGitHubConnection, "name" | "method" | "description"> & {
  returnUrl?: string;
  connectionId?: string;
};

type AzureFormData = Pick<TGitHubConnection, "name" | "method" | "description"> & {
  returnUrl?: string;
  connectionId?: string;
  tenantId?: string;
  resource: AzureResources;
};

type FormDataMap = {
  [AppConnection.GitHub]: GithubFormData & { app: AppConnection.GitHub };
  [AppConnection.Azure]: AzureFormData & { app: AppConnection.Azure };
};

const formDataStorageFieldMap: Partial<Record<AppConnection, string>> = {
  [AppConnection.GitHub]: "githubConnectionFormData",
  [AppConnection.Azure]: "azureConnectionFormData"
};

export const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);

  const search = useSearch({
    from: ROUTE_PATHS.Organization.AppConnections.OauthCallbackPage.id
  });

  const appConnection = useParams({
    strict: false,
    select: (el) => el?.appConnection as AppConnection
  });

  const updateAppConnection = useUpdateAppConnection();
  const createAppConnection = useCreateAppConnection();

  const { code, state, installation_id: installationId } = search;

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

  const handleAzure = useCallback(async () => {
    const formData = getFormData(AppConnection.Azure);
    if (formData === null) return null;

    clearState(AppConnection.Azure);

    const { connectionId, name, description, returnUrl } = formData;

    try {
      if (connectionId) {
        await updateAppConnection.mutateAsync({
          app: AppConnection.Azure,
          connectionId,
          credentials: {
            code: code as string
          }
        });
      } else {
        await createAppConnection.mutateAsync({
          app: AppConnection.Azure,
          name,
          description,
          method: AzureConnectionMethod.OAuth,
          credentials: {
            resource: formData.resource,
            tenantId: formData.tenantId,
            code: code as string
          }
        });
      }
    } catch (err: any) {
      createNotification({
        title: `Failed to ${connectionId ? "update" : "add"} Azure Connection`,
        text: err?.message,
        type: "error"
      });
      navigate({
        to: returnUrl ?? "/organization/settings?selectedTab=app-connections"
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
        to: returnUrl ?? "/organization/settings?selectedTab=app-connections"
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
      } else if (appConnection === AppConnection.Azure) {
        data = await handleAzure();
      }

      if (data) {
        createNotification({
          text: `Successfully ${data.connectionId ? "updated" : "added"} ${data.appConnectionName || ""} Connection`,
          type: "success"
        });
      }

      await navigate({
        to: data?.returnUrl ?? "/organization/settings?selectedTab=app-connections"
      });
    })();
  }, [isReady]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Please wait! Authentication in process." />
    </div>
  );
};
