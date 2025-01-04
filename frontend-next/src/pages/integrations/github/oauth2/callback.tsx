import { useEffect } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

import { useAuthorizeIntegration } from "@app/hooks/api";

export default function GitHubOAuth2CallbackPage() {
  const router = useRouter();
  const { mutateAsync } = useAuthorizeIntegration();

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { code, state, installation_id } = queryString.parse(router.asPath.split("?")[1]);

  useEffect(() => {
    (async () => {
      try {
        // validate state
        if (state !== localStorage.getItem("latestCSRFToken")) {
          return;
        }

        localStorage.removeItem("latestCSRFToken");

        const integrationAuth = await mutateAsync({
          workspaceId: localStorage.getItem("projectData.id") as string,
          code: code as string,
          installationId: installation_id as string,
          integration: "github"
        });

        router.push(`/integrations/github/create?integrationAuthId=${integrationAuth.id}`);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return <div />;
}

GitHubOAuth2CallbackPage.requireAuth = true;
