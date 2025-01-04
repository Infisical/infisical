import { createFileRoute } from "@tanstack/react-router";

import { CodefreshAuthorizePage } from "./CodefreshAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/codefresh/authorize"
)({
  component: CodefreshAuthorizePage
});
