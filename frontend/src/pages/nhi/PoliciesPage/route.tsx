import { createFileRoute } from "@tanstack/react-router";

import { NhiPoliciesPage } from "./NhiPoliciesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nhi/$projectId/_nhi-layout/policies"
)({
  component: NhiPoliciesPage
});
