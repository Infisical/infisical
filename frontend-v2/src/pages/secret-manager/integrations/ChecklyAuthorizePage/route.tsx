import { createFileRoute } from "@tanstack/react-router";

import { ChecklyAuthorizePage } from "./ChecklyAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/checkly/authorize"
)({
  component: ChecklyAuthorizePage
});
