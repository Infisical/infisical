import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { createNotification } from "@app/components/notifications";
import { localStorageService } from "@app/helpers/localStorage";

import { VercelOAuthCallbackPageQueryParamsSchema } from "./VercelOauthCallbackPage/route";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/integrations/vercel/oauth2/callback"
)({
  validateSearch: zodValidator(VercelOAuthCallbackPageQueryParamsSchema),
  beforeLoad: ({ search }) => {
    const projectId = localStorageService.getIintegrationProjectId();
    if (!projectId) {
      createNotification({
        type: "error",
        title: "Missing project id",
        text: "Please retry integration"
      });
      throw redirect({ to: "/organization/projects" });
    }
    throw redirect({
      to: "/projects/$projectId/secret-manager/integrations/vercel/oauth2/callback",
      params: { projectId },
      search
    });
  }
});
