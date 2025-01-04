import { createFileRoute } from "@tanstack/react-router";

import { FlyioAuthorizePage } from "./FlyioAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/flyio/authorize"
)({
  component: FlyioAuthorizePage
});
