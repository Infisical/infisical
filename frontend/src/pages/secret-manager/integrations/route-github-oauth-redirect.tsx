import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { createNotification } from "@app/components/notifications";
import { localStorageService } from "@app/helpers/localStorage";

import { GithubOAuthCallbackPageQueryParamsSchema } from "./GithubOauthCallbackPage/route";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/integrations/github/oauth2/callback"
)({
  validateSearch: zodValidator(GithubOAuthCallbackPageQueryParamsSchema),
  beforeLoad: ({ search }) => {
    const projectId = localStorageService.getIintegrationProjectId();
    if (!projectId) {
      createNotification({
        type: "error",
        title: "Missing project id",
        text: "Please retry integration"
      });
      throw redirect({ to: "/organization/secret-manager/overview" });
    }
    throw redirect({
      to: "/secret-manager/$projectId/integrations/github/oauth2/callback",
      params: { projectId },
      search
    });
  }
});
