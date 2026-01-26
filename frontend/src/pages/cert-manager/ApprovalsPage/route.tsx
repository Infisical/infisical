import { createFileRoute } from "@tanstack/react-router";

import { ApprovalsPage } from "./ApprovalsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approvals"
)({
  component: ApprovalsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Approvals"
        }
      ]
    };
  }
});
