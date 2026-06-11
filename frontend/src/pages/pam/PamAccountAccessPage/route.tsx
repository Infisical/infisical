import { createFileRoute } from "@tanstack/react-router";

import { PamAccountAccessPage } from "./PamAccountAccessPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organizations/$orgId/pam/accounts/$accountType/$accountId/access"
)({
  component: PamAccountAccessPage
});
