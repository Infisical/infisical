import { createFileRoute } from "@tanstack/react-router";

import { PamAccountPoliciesPage } from "./PamAccountPoliciesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/account-policies"
)({
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Account Policies"
        }
      ]
    };
  },
  component: PamAccountPoliciesPage
});
