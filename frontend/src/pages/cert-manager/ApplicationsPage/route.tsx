import { createFileRoute } from "@tanstack/react-router";

import { ApplicationsPage } from "./ApplicationsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/applications/"
)({
  component: ApplicationsPage,
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Applications" }]
  })
});
