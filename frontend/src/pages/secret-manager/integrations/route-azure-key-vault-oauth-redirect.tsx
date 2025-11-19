import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { createNotification } from "@app/components/notifications";
import { localStorageService } from "@app/helpers/localStorage";

import { AzureKeyVaultOauthCallbackQueryParamsSchema } from "./AzureKeyVaultOauthCallbackPage/route";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/integrations/azure-key-vault/oauth2/callback"
)({
  validateSearch: zodValidator(AzureKeyVaultOauthCallbackQueryParamsSchema),
  beforeLoad: ({ search, params }) => {
    const projectId = localStorageService.getIintegrationProjectId();
    if (!projectId) {
      createNotification({
        type: "error",
        title: "Missing project id",
        text: "Please retry integration"
      });
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: params.orgId }
      });
    }
    throw redirect({
      to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-key-vault/oauth2/callback",
      params: { orgId: params.orgId, projectId },
      search
    });
  }
});
