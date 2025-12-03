import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

export const GithubOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();
  const { currentOrg } = useOrganization();
  const {
    code,
    state,
    installation_id: installationId
  } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GithubOauthCallbackPage.id
  });
  const { currentProject } = useProject();

  useEffect(() => {
    (async () => {
      try {
        // validate state
        if (state !== localStorage.getItem("latestCSRFToken")) {
          return;
        }

        localStorage.removeItem("latestCSRFToken");

        const integrationAuth = await mutateAsync({
          workspaceId: currentProject.id,
          code: code as string,
          installationId,
          integration: "github"
        });

        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/github/create",
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
      }
    })();
  }, []);

  return <div />;
};
