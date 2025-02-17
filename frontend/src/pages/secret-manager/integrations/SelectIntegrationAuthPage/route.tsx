import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { SelectIntegrationAuthPage } from "./SelectIntegrationAuthPage";

const SelectIntegrationAuthPageQueryParamsSchema = z.object({
  integrationSlug: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/select-integration-auth"
)({
  component: SelectIntegrationAuthPage,
  validateSearch: zodValidator(SelectIntegrationAuthPageQueryParamsSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/secret-manager/$projectId/integrations",
            params,
            search: {
              selectedTab: IntegrationsListPageTabs.NativeIntegrations
            }
          })
        },
        {
          label: "Configure"
        }
      ]
    };
  }
});
