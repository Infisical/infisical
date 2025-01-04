import { createFileRoute } from "@tanstack/react-router";

import { AzureDevopsAuthorizePage } from "./AzureDevopsAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-devops/authorize"
)({
  component: AzureDevopsAuthorizePage
});
