import { createFileRoute } from "@tanstack/react-router";

import { PoliciesPage } from "./PoliciesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-management/$projectId/_cert-manager-layout/policies"
)({
  component: PoliciesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Policies"
        }
      ]
    };
  }
});
