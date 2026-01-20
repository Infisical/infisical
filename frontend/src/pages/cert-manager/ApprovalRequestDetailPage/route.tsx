import { createFileRoute } from "@tanstack/react-router";

import { ApprovalRequestDetailPage } from "./ApprovalRequestDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approval-requests/$approvalRequestId"
)({
  component: ApprovalRequestDetailPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Approval Request"
        }
      ]
    };
  }
});
