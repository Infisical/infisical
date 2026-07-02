import { createFileRoute } from "@tanstack/react-router";

import { PamApprovalRequestsPage } from "./PamApprovalRequestsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/approval-requests"
)({
  component: PamApprovalRequestsPage,
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Approval Requests" }]
  })
});
