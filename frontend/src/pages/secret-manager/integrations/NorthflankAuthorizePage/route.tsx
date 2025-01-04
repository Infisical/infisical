import { createFileRoute } from "@tanstack/react-router";

import { NorthflankAuthorizePage } from "./NorthflankAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/northflank/authorize"
)({
  component: NorthflankAuthorizePage
});
