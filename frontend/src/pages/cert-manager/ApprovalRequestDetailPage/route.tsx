import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";

import { ApprovalRequestDetailPage } from "./ApprovalRequestDetailPage";

const ApprovalRequestSearchSchema = z.object({
  policyType: z.nativeEnum(ApprovalPolicyType).optional(),
  applicationName: z.string().optional(),
  signerId: z.string().optional(),
  from: z.enum(["root-requests"]).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/approvals/$approvalRequestId"
)({
  component: ApprovalRequestDetailPage,
  validateSearch: zodValidator(ApprovalRequestSearchSchema),
  beforeLoad: ({ context, params, search }) => {
    const parent =
      search.policyType === ApprovalPolicyType.CertCodeSigning
        ? {
            label: "Requests",
            link: linkOptions({
              to: "/organizations/$orgId/cert-manager/requests",
              params: { orgId: params.orgId },
              search: { selectedTab: "signing-requests" as const }
            })
          }
        : {
            label: "Approvals",
            link: linkOptions({
              to: "/organizations/$orgId/cert-manager/approvals",
              params: { orgId: params.orgId }
            })
          };
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        parent,
        {
          label: "Approval Request"
        }
      ]
    };
  }
});
