import { createFileRoute } from "@tanstack/react-router";

import { TeamcityAuthorizePage } from "./TeamcityAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/teamcity/authorize"
)({
  component: TeamcityAuthorizePage
});
