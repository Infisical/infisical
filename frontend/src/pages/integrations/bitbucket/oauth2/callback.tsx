import { useEffect } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

import {
  useAuthorizeIntegration
} from "@app/hooks/api";

export default function BitBucketOAuth2CallbackPage() {
  const router = useRouter();
  const { mutateAsync } = useAuthorizeIntegration();
  const { code, state } = queryString.parse(router.asPath.split("?")[1]);

  useEffect(() => {
    (async () => {
      try {
        // validate state
        if (state !== localStorage.getItem("latestCSRFToken")) return;
        localStorage.removeItem("latestCSRFToken");

        const integrationAuth = await mutateAsync({
          workspaceId: localStorage.getItem("projectData.id") as string,
          code: code as string,
          integration: "bitbucket"
        });

        router.push(`/integrations/bitbucket/create?integrationAuthId=${integrationAuth._id}`);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return <div />;
}

BitBucketOAuth2CallbackPage.requireAuth = true;
