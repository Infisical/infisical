import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CircleCIAuthorizePage } from "./CircleCIAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/circleci/authorize"
)({
  component: CircleCIAuthorizePage,
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
          label: "Circle CI"
        }
      ]
    };
  }
});
