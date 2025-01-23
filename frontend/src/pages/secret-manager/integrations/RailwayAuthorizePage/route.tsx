import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { RailwayAuthorizePage } from "./RailwayAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/railway/authorize"
)({
  component: RailwayAuthorizePage,
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
          label: "Railway"
        }
      ]
    };
  }
});
