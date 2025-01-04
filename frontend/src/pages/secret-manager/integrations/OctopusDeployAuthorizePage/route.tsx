import { createFileRoute } from "@tanstack/react-router";

import { OctopusDeployAuthorizePage } from "./OctopusDeployAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/octopus-deploy/authorize"
)({
  component: OctopusDeployAuthorizePage
});
