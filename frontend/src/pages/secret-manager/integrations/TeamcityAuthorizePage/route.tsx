import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { TeamcityAuthorizePage } from "./TeamcityAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/teamcity/authorize"
)({
  component: TeamcityAuthorizePage,
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
          label: "Teamcity"
        }
      ]
    };
  }
});
