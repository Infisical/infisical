import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AzureDevopsAuthorizePage } from "./AzureDevopsAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/azure-devops/authorize"
)({
  component: AzureDevopsAuthorizePage,
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
