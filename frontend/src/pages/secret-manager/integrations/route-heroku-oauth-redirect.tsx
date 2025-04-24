import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { createNotification } from "@app/components/notifications";
import { localStorageService } from "@app/helpers/localStorage";

import { HerokuOAuthCallbackPageQueryParamsSchema } from "./HerokuOauthCallbackPage/route";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/integrations/heroku/oauth2/callback"
)({
  validateSearch: zodValidator(HerokuOAuthCallbackPageQueryParamsSchema),
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
      to: "/secret-manager/$projectId/integrations/heroku/oauth2/callback",
      params: { projectId },
      search
    });
  }
});
