import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AzureAppConfigurationOauthCallbackPage } from "./AzureAppConfigurationOauthCallbackPage";

export const AzureAppConfigurationOauthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/azure-app-configuration/oauth2/callback"
)({
  component: AzureAppConfigurationOauthCallbackPage,
  validateSearch: zodValidator(AzureAppConfigurationOauthCallbackPageQueryParamsSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/secret-manager/$projectId/integrations",
            params
          })
        },
        {
          label: "Azure App Configuration"
        }
      ]
    };
  }
});
