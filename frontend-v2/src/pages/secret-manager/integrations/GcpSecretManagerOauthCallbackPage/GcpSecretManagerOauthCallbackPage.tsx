import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import { useAuthorizeIntegration } from "@app/hooks/api";

export const GcpSecretManagerOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useAuthorizeIntegration();

  const { code, state } = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GcpSecretManagerOauthCallbackPage.id
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
          integration: "gcp-secret-manager"
        });

        navigate({
          to: "/secret-manager/$projectId/integrations/gcp-secret-manager/create",
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
