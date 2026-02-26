import { createFileRoute } from "@tanstack/react-router";

import { NhiIdentityDetailPage } from "./NhiIdentityDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nhi/$projectId/_nhi-layout/discovered-identities/$nhiIdentityId"
)({
  component: NhiIdentityDetailPage
});
