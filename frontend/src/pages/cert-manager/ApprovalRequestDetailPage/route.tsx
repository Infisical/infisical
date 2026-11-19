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

// Revocation requests only exist in Applications, so they live in Application Requests, not the
// legacy Approvals page.
const REQUESTS_TAB_BY_POLICY_TYPE: Partial<
  Record<ApprovalPolicyType, "signing-requests" | "application-requests">
> = {
  [ApprovalPolicyType.CertCodeSigning]: "signing-requests",
  [ApprovalPolicyType.CertRevocation]: "application-requests"
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/approvals/$approvalRequestId"
)({
  component: ApprovalRequestDetailPage,
  validateSearch: zodValidator(ApprovalRequestSearchSchema),
  beforeLoad: ({ context, params, search }) => {
    const requestsTab = search.policyType && REQUESTS_TAB_BY_POLICY_TYPE[search.policyType];
    const parent = requestsTab
      ? {
          label: "Requests",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/requests",
            params: { orgId: params.orgId },
            search: { selectedTab: requestsTab }
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
