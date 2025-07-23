import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { LaravelForgeAuthorizePage } from "./LaravelForgeAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/laravel-forge/authorize"
)({
  component: LaravelForgeAuthorizePage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/projects/secret-management/$projectId/integrations",
            params,
            search: {
              selectedTab: IntegrationsListPageTabs.NativeIntegrations
            }
          })
        },
        {
          label: "Laravel Forge"
        }
      ]
    };
  }
});
