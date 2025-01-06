import { createFileRoute } from "@tanstack/react-router";

import { DatabricksAuthorizePage } from "./DatabricksAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/databricks/authorize"
)({
  component: DatabricksAuthorizePage
});
