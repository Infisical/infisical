import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { RundeckAuthorizePage } from "./RundeckAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/rundeck/authorize"
)({
  component: RundeckAuthorizePage,
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
          label: "Rundeck"
        }
      ]
    };
  }
});
