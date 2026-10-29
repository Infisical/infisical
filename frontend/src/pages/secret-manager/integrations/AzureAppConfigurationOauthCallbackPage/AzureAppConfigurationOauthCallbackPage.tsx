import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

import {
  IntegrationOauthCallbackStatus,
  INVALID_OAUTH_STATE_MESSAGE
} from "../components/IntegrationOauthCallbackStatus";

export const AzureAppConfigurationOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const { currentOrg } = useOrganization();
  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AzureAppConfigurationsOauthCallbackPage.id
  });
  const { currentProject } = useProject();

  useEffect(() => {
    // Runs once: a second run under StrictMode would find the CSRF token already consumed.
    if (hasStarted.current) return;
    hasStarted.current = true;

    (async () => {
      try {
        // validate state
        if (state !== localStorage.getItem("latestCSRFToken")) {
          setError(INVALID_OAUTH_STATE_MESSAGE);
          return;
        }
        localStorage.removeItem("latestCSRFToken");

        const integrationAuth = await mutateAsync({
          workspaceId: currentProject.id,
          code: code as string,
          integration: "azure-app-configuration"
        });

        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-app-configuration/create",
          params: {
            orgId: currentOrg.id,
            projectId: currentProject.id
          },
          search: {
            integrationAuthId: integrationAuth.id
          },
          replace: true
        });
      } catch (err) {
        console.error(err);
        setError("Infisical couldn't finish authorizing with Azure App Configuration.");
      }
    })();
  }, []);

  return <IntegrationOauthCallbackStatus integrationName="Azure App Configuration" error={error} />;
};
