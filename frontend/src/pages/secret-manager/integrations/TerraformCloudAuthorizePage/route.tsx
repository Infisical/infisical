import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { TerraformCloudAuthorizePage } from "./TerraformCloudAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/terraform-cloud/authorize"
)({
  component: TerraformCloudAuthorizePage,
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
          label: "Terraform Cloud"
        }
      ]
    };
  }
});
