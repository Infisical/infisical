import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { createNotification } from "@app/components/notifications";
import { localStorageService } from "@app/helpers/localStorage";

import { AzureAppConfigurationOauthCallbackPageQueryParamsSchema } from "./AzureAppConfigurationOauthCallbackPage/route";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/integrations/azure-app-configuration/oauth2/callback"
)({
  validateSearch: zodValidator(AzureAppConfigurationOauthCallbackPageQueryParamsSchema),
  beforeLoad: ({ context, search }) => {
    const orgId = context.organizationId;
    const projectId = localStorageService.getIintegrationProjectId();
    if (!projectId) {
      createNotification({
        type: "error",
        title: "Missing project id",
        text: "Please retry integration"
      });
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId }
      });
    }
    throw redirect({
      to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-app-configuration/oauth2/callback",
      params: { orgId, projectId },
      search
    });
  }
});
