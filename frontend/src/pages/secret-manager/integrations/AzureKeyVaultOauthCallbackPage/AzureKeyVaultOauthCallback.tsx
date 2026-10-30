import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

import {
  IntegrationOauthCallbackStatus,
  INVALID_OAUTH_STATE_MESSAGE
} from "../components/IntegrationOauthCallbackStatus";

export const AzureKeyVaultOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const { currentOrg } = useOrganization();
  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AzureKeyVaultOauthCallbackPage.id
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
          integration: "azure-key-vault"
        });

        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-key-vault/create",
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
        setError("Infisical couldn't finish authorizing with Azure Key Vault.");
      }
    })();
  }, []);

  return <IntegrationOauthCallbackStatus integrationName="Azure Key Vault" error={error} />;
};
