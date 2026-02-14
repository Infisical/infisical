import { createFileRoute } from "@tanstack/react-router";

import { PamAccountAccessPage } from "./PamAccountAccessPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId/access"
)({
  component: PamAccountAccessPage
});
