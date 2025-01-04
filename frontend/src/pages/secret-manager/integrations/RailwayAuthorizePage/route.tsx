import { createFileRoute } from "@tanstack/react-router";

import { RailwayAuthorizePage } from "./RailwayAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/railway/authorize"
)({
  component: RailwayAuthorizePage
});
