import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { GitlabAuthorizePage } from "./GitlabAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/gitlab/authorize"
)({
  component: GitlabAuthorizePage,
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
          label: "GitLab"
        }
      ]
    };
  }
});
