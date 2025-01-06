import { createFileRoute } from "@tanstack/react-router";

import { TravisCIAuthorizePage } from "./TravisCIAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/travisci/authorize"
)({
  component: TravisCIAuthorizePage
});
