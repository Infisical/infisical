import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  GitHubConnectionMethod,
  TGitHubConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type FormData = Pick<TGitHubConnection, "name" | "method" | "description"> & {
  returnUrl?: string;
  connectionId?: string;
};

export const GitHubOAuthCallbackPage = () => {
  const navigate = useNavigate();
  const search = useSearch({
    from: ROUTE_PATHS.Organization.AppConnections.GithubOauthCallbackPage.id
  });
  const updateAppConnection = useUpdateAppConnection();
  const createAppConnection = useCreateAppConnection();

  const { code, state, installation_id: installationId } = search;

  useEffect(() => {
    (async () => {
      let formData: FormData;

      try {
        formData = JSON.parse(localStorage.getItem("githubConnectionFormData") ?? "{}") as FormData;
      } catch {
        createNotification({
          type: "error",
          text: "Invalid form state, redirecting..."
        });
        navigate({ to: "/" });
        return;
      }

      // validate state
      if (state !== localStorage.getItem("latestCSRFToken")) {
        createNotification({
          type: "error",
          text: "Invalid state, redirecting..."
        });
        navigate({ to: "/" });
        return;
      }

      localStorage.removeItem("githubConnectionFormData");
      localStorage.removeItem("latestCSRFToken");

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
        return;
      }

      createNotification({
        text: `Successfully ${connectionId ? "updated" : "added"} GitHub Connection`,
        type: "success"
      });

      navigate({
        to: returnUrl ?? "/organization/settings?selectedTab=app-connections"
      });
    })();
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Please wait! Authentication in process." />
    </div>
  );
};
