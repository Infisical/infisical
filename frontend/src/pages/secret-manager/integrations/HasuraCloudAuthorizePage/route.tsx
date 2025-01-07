import { createFileRoute } from "@tanstack/react-router";

import { HasuraCloudAuthorizePage } from "./HasuraCloudAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/hasura-cloud/authorize"
)({
  component: HasuraCloudAuthorizePage
});
