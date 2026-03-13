import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";

import { ApprovalRequestDetailPage } from "./ApprovalRequestDetailPage";

const ApprovalRequestSearchSchema = z.object({
  policyType: z.nativeEnum(ApprovalPolicyType).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approval-requests/$approvalRequestId"
)({
  component: ApprovalRequestDetailPage,
  validateSearch: zodValidator(ApprovalRequestSearchSchema),
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
