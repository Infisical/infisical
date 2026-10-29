import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

import {
  IntegrationOauthCallbackStatus,
  INVALID_OAUTH_STATE_MESSAGE
} from "../components/IntegrationOauthCallbackStatus";

export const GcpSecretManagerOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();
  const [error, setError] = useState<string | null>(null);
  const { currentOrg } = useOrganization();
  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GcpSecretManagerOauthCallbackPage.id
  });
  const { currentProject } = useProject();

  useEffect(() => {
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
          integration: "gcp-secret-manager"
        });

        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/gcp-secret-manager/create",
          params: {
            orgId: currentOrg.id,
            projectId: currentProject.id
          },
          search: {
            integrationAuthId: integrationAuth.id
          }
        });
      } catch (err) {
        console.error(err);
        setError("Infisical couldn't finish authorizing with GCP Secret Manager.");
      }
    })();
  }, []);

  return <IntegrationOauthCallbackStatus integrationName="GCP Secret Manager" error={error} />;
};
