import { createFileRoute } from "@tanstack/react-router";

import { CircleCIAuthorizePage } from "./CircleCIAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/circleci/authorize"
)({
  component: CircleCIAuthorizePage
});
