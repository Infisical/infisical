import { useEffect } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

import {
  useAuthorizeIntegration
} from "@app/hooks/api";

export default function GitLabOAuth2CallbackPage() {
  const router = useRouter();
  const { mutateAsync } = useAuthorizeIntegration();

  const { code, state } = queryString.parse(router.asPath.split("?")[1]);
  useEffect(() => {
    (async () => {
      try {
        // validate state
        const [csrfToken, url] = (state as string).split("|", 2);
        
        if (csrfToken !== localStorage.getItem("latestCSRFToken")) return;
        localStorage.removeItem("latestCSRFToken");

        const integrationAuth = await mutateAsync({
          workspaceId: localStorage.getItem("projectData.id") as string,
          code: code as string,
          integration: "gitlab",
          ...(url === "" ? {} : {
            url
          })
        });

        router.push(`/integrations/gitlab/create?integrationAuthId=${integrationAuth._id}`);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return <div />;
}

GitLabOAuth2CallbackPage.requireAuth = true;
