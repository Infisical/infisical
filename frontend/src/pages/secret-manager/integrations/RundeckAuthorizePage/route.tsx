import { createFileRoute } from "@tanstack/react-router";

import { RundeckAuthorizePage } from "./RundeckAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/rundeck/authorize"
)({
  component: RundeckAuthorizePage
});
