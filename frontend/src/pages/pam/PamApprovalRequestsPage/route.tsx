import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamApprovalRequestsPage } from "./PamApprovalRequestsPage";

const approvalRequestsSearchParams = z.object({
  requestId: z.string().optional().catch(undefined)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/approval-requests"
)({
  component: PamApprovalRequestsPage,
  validateSearch: zodValidator(approvalRequestsSearchParams),
  search: {
    middlewares: [stripSearchParams({ requestId: undefined })]
  },
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Approval Requests" }]
  })
});
