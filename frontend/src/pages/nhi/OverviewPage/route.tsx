import { createFileRoute } from "@tanstack/react-router";

import { NhiOverviewPage } from "./NhiOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nhi/$projectId/_nhi-layout/overview"
)({
  component: NhiOverviewPage
});
