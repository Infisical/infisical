import { createFileRoute } from "@tanstack/react-router";

import { TerraformCloudAuthorizePage } from "./TerraformCloudAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/terraform-cloud/authorize"
)({
  component: TerraformCloudAuthorizePage
});
