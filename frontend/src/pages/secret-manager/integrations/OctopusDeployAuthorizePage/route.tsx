import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OctopusDeployAuthorizePage } from "./OctopusDeployAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/octopus-deploy/authorize"
)({
  component: OctopusDeployAuthorizePage,
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
          label: "Octopus Deploy"
        }
      ]
    };
  }
});
