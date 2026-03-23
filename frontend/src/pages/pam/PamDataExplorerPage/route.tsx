import { createFileRoute } from "@tanstack/react-router";

import { PamDataExplorerPage } from "./PamDataExplorerPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId/data-explorer"
)({
  component: PamDataExplorerPage
});
