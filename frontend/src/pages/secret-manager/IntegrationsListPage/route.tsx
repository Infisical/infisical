import { createFileRoute } from "@tanstack/react-router";

import { IntegrationsListPage } from "./IntegrationsListPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/"
)({
  component: IntegrationsListPage
});
