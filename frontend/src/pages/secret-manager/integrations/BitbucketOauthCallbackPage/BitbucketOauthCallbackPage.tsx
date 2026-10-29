import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

import {
  IntegrationOauthCallbackStatus,
  INVALID_OAUTH_STATE_MESSAGE
} from "../components/IntegrationOauthCallbackStatus";

export const BitbucketOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();
  const [error, setError] = useState<string | null>(null);
  const { currentOrg } = useOrganization();
  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.BitbucketOauthCallbackPage.id
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
          integration: "bitbucket"
        });

        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/bitbucket/create",
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
        setError("Infisical couldn't finish authorizing with Bitbucket.");
      }
    })();
  }, []);

  return <IntegrationOauthCallbackStatus integrationName="Bitbucket" error={error} />;
};
