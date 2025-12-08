import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateAppConnection, useUpdateAppConnection } from "@app/hooks/api/appConnections";
import { GitLabConnectionMethod } from "@app/hooks/api/appConnections/types/gitlab-connection";

export const GitLabOAuthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createAppConnection } = useCreateAppConnection();
  const { mutateAsync: updateAppConnection } = useUpdateAppConnection();

  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GitlabOauthCallbackPage.id
  });
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  useEffect(() => {
    (async () => {
      try {
        // Validate CSRF state token
        const [csrfToken] = (state as string).split("|", 2);
        const storedState = localStorage.getItem("latestCSRFToken");
        if (csrfToken !== storedState) {
          console.error("CSRF token mismatch");
          navigate({
            to: "/organizations/$orgId/app-connections",
            params: { orgId: currentOrg.id },
            search: { error: "invalid_state" }
          });
          return;
        }

        localStorage.removeItem("latestCSRFToken");

        const storedFormData = localStorage.getItem("gitlabConnectionFormData");
        if (!storedFormData) {
          console.error("No stored form data found");
          navigate({
            to: "/organizations/$orgId/app-connections",
            params: { orgId: currentOrg.id },
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
            workspaceId: currentProject.id,
            ...connectionData
          });
        }

        // Navigate to success page or app connections list

        navigate({
          to: "/organizations/$orgId/app-connections",
          params: { orgId: currentOrg.id },
          search: {
            success: formData.isUpdate ? "connection_updated" : "connection_created",
            connectionId: appConnection.id
          }
        });
      } catch (err) {
        console.error("Error handling GitLab OAuth callback:", err);
        navigate({
          to: "/organizations/$orgId/app-connections",
          params: { orgId: currentOrg.id },
          search: { error: "connection_failed" }
        });
      }
    })();
  }, [
    code,
    state,
    navigate,
    createAppConnection,
    updateAppConnection,
    currentProject.id,
    currentOrg.id
  ]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        <p className="text-gray-600">Connecting to GitLab...</p>
      </div>
    </div>
  );
};
