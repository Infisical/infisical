import { createFileRoute } from "@tanstack/react-router";

import { IntegrationDetailsByIDPage } from "./IntegrationsDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/$integrationId"
)({
  component: IntegrationDetailsByIDPage
});
