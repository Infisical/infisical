import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

export const AzureAppConfigurationOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();

  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AzureAppConfigurationsOauthCallbackPage.id
  });
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    (async () => {
      try {
        // validate state
        if (state !== localStorage.getItem("latestCSRFToken")) return;
        localStorage.removeItem("latestCSRFToken");

        const integrationAuth = await mutateAsync({
          workspaceId: currentWorkspace.id,
          code: code as string,
          integration: "azure-app-configuration"
        });

        navigate({
          to: "/projects/$projectId/secret-manager/integrations/azure-app-configuration/create",
          params: {
            projectId: currentWorkspace.id
          },
          search: {
            integrationAuthId: integrationAuth.id
          }
        });
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return <div />;
};
