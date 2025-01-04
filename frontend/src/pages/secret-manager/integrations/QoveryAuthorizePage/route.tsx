import { createFileRoute } from "@tanstack/react-router";

import { QoveryAuthorizePage } from "./QoveryAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/qovery/authorize"
)({
  component: QoveryAuthorizePage
});
