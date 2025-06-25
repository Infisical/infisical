import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import { useCreateAppConnection, useUpdateAppConnection } from "@app/hooks/api/appConnections";
import { GitLabConnectionMethod } from "@app/hooks/api/appConnections/types/gitlab-connection";

export const GitLabOAuthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createAppConnection } = useCreateAppConnection();
  const { mutateAsync: updateAppConnection } = useUpdateAppConnection();

  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GitlabOauthCallbackPage.id
  });
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    (async () => {
      try {
        // Validate CSRF state token
        const [csrfToken] = (state as string).split("|", 2);
        const storedState = localStorage.getItem("latestCSRFToken");
        if (csrfToken !== storedState) {
          console.error("CSRF token mismatch");
          navigate({
            to: "/organization/app-connections",
            search: { error: "invalid_state" }
          });
          return;
        }

        localStorage.removeItem("latestCSRFToken");

        const storedFormData = localStorage.getItem("gitlabConnectionFormData");
        if (!storedFormData) {
          console.error("No stored form data found");
          navigate({
            to: "/organization/app-connections",
            search: { error: "missing_form_data" }
          });
          return;
        }

        const formData = JSON.parse(storedFormData);
        localStorage.removeItem("gitlabConnectionFormData");

        // Prepare app connection data with OAuth credentials
        const connectionData = {
          ...formData,
          method: GitLabConnectionMethod.OAuth,
          credentials: {
            code: code as string
          }
        };

        let appConnection;

        // Create or update app connection
        if (formData.isUpdate && formData.connectionId) {
          appConnection = await updateAppConnection({
            connectionId: formData.connectionId,
            ...connectionData
          });
        } else {
          appConnection = await createAppConnection({
            workspaceId: currentWorkspace.id,
            ...connectionData
          });
        }

        // Navigate to success page or app connections list

        navigate({
          to: "/organization/app-connections",
          search: {
            success: formData.isUpdate ? "connection_updated" : "connection_created",
            connectionId: appConnection.id
          }
        });
      } catch (err) {
        console.error("Error handling GitLab OAuth callback:", err);
        navigate({
          to: "/organization/app-connections",
          search: { error: "connection_failed" }
        });
      }
    })();
  }, [code, state, navigate, createAppConnection, updateAppConnection, currentWorkspace.id]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        <p className="text-gray-600">Connecting to GitLab...</p>
      </div>
    </div>
  );
};
