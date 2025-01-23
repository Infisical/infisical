import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AzureDevopsConfigurePage } from "./AzureDevopsConfigurePage";

const AzureDevopsConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/azure-devops/create"
)({
  component: AzureDevopsConfigurePage,
  validateSearch: zodValidator(AzureDevopsConfigurePageQueryParamsSchema),
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
          label: "Azure Devops"
        }
      ]
    };
  }
});
