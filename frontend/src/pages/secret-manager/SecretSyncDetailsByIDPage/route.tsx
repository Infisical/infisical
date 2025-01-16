import { createFileRoute } from "@tanstack/react-router";

import { SecretSyncDetailsByIDPage } from "./SecretSyncDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/secret-syncs/$destination/$syncId"
)({
  component: SecretSyncDetailsByIDPage
});
