import { createFileRoute } from "@tanstack/react-router";

import { NhiSourcesPage } from "./NhiSourcesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nhi/$projectId/_nhi-layout/sources"
)({
  component: NhiSourcesPage
});
