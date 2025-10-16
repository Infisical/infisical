import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

export const GcpSecretManagerOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();

  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GcpSecretManagerOauthCallbackPage.id
  });
  const { currentProject } = useProject();

  useEffect(() => {
    (async () => {
      try {
        // validate state

        if (state !== localStorage.getItem("latestCSRFToken")) return;
        localStorage.removeItem("latestCSRFToken");
        const integrationAuth = await mutateAsync({
          workspaceId: currentProject.id,
          code: code as string,
          integration: "gcp-secret-manager"
        });

        navigate({
          to: "/projects/secret-management/$projectId/integrations/gcp-secret-manager/create",
          params: {
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
