import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { Cloud66AuthorizePage } from "./Cloud66AuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/cloud-66/authorize"
)({
  component: Cloud66AuthorizePage,
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
          label: "Cloud 66"
        }
      ]
    };
  }
});
