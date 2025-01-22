import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AzureAppConfigurationConfigurePage } from "./AzureAppConfigurationConfigurePage";

const AzureAppConfigurationPageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/azure-app-configuration/create"
)({
  component: AzureAppConfigurationConfigurePage,
  validateSearch: zodValidator(AzureAppConfigurationPageQueryParamsSchema),
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
