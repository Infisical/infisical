import { createFileRoute } from "@tanstack/react-router";

import { NhiIdentitiesPage } from "./NhiIdentitiesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nhi/$projectId/_nhi-layout/discovered-identities/"
)({
  component: NhiIdentitiesPage
});
