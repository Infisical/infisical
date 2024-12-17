import { useEffect } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import {
  GitHubConnectionMethod,
  TAppConnection,
  TGitHubConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type FormData = Pick<TGitHubConnection, "name" | "method"> & {
  returnUrl?: string;
  connectionId?: string;
};

export default function GitHubOAuthCallbackPage() {
  const router = useRouter();
  const updateAppConnection = useUpdateAppConnection();
  const createAppConnection = useCreateAppConnection();

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const {
    code,
    state,
    installation_id: installationId
  } = queryString.parse(router.asPath.split("?")[1]);

  useEffect(() => {
    (async () => {
      let formData: FormData;

      try {
        formData = JSON.parse(localStorage.getItem("githubConnectionFormData") ?? "{}") as FormData;
      } catch (e) {
        createNotification({
          type: "error",
          text: "Invalid form state, redirecting..."
        });
        router.push(window.location.origin);
        return;
      }

      // validate state
      if (state !== localStorage.getItem("latestCSRFToken")) {
        createNotification({
          type: "error",
          text: "Invalid state, redirecting..."
        });
        router.push(window.location.origin);
        return;
      }

      localStorage.removeItem("githubConnectionFormData");
      localStorage.removeItem("latestCSRFToken");

      const { connectionId, name, returnUrl } = formData;

      let appConnection: TAppConnection;

      try {
        if (connectionId) {
          appConnection = await updateAppConnection.mutateAsync({
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
          appConnection = await createAppConnection.mutateAsync({
            app: AppConnection.GitHub,
            name,
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
        router.push(
          returnUrl ??
            `/org/${localStorage.getItem("orgData.id")}/settings?selectedTab=app-connections`
        );
        return;
      }

      createNotification({
        text: `Successfully ${connectionId ? "updated" : "added"} GitHub Connection`,
        type: "success"
      });

      router.push(returnUrl ?? `/org/${appConnection.orgId}/settings?selectedTab=app-connections`);
    })();
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader />
    </div>
  );
}

GitHubOAuthCallbackPage.requireAuth = true;
