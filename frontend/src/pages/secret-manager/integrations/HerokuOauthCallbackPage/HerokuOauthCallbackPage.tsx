import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateAppConnection, useUpdateAppConnection } from "@app/hooks/api/appConnections";
import { HerokuConnectionMethod } from "@app/hooks/api/appConnections/types/heroku-connection";

export const HerokuOAuthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createAppConnection } = useCreateAppConnection();
  const { mutateAsync: updateAppConnection } = useUpdateAppConnection();

  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.HerokuOauthCallbackPage.id
  });
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  useEffect(() => {
    (async () => {
      try {
        // Validate CSRF state token
        const storedState = localStorage.getItem("latestCSRFToken");
        if (state !== storedState) {
          console.error("CSRF token mismatch");
          navigate({
            to: "/organizations/$orgId/app-connections",
            params: { orgId: currentOrg.id },
            search: { error: "invalid_state" }
          });
          return;
        }

        // Clean up CSRF token
        localStorage.removeItem("latestCSRFToken");

        // Retrieve stored form data
        const storedFormData = localStorage.getItem("herokuConnectionFormData");
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
        localStorage.removeItem("herokuConnectionFormData");

        // Prepare app connection data with OAuth credentials
        const connectionData = {
          ...formData,
          method: HerokuConnectionMethod.OAuth,
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
        console.error("Error handling Heroku OAuth callback:", err);
        navigate({
          to: "/organizations/$orgId/app-connections",
          params: { orgId: currentOrg.id },
          search: { error: "connection_failed" }
        });
      }
    })();
  }, [code, state, navigate, createAppConnection, updateAppConnection, currentProject.id]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        <p className="text-gray-600">Connecting to Heroku...</p>
      </div>
    </div>
  );
};
