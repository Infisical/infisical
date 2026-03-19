import { createFileRoute } from "@tanstack/react-router";

import { PamDataBrowserPage } from "./PamDataBrowserPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId/data-browser"
)({
  component: PamDataBrowserPage
});
