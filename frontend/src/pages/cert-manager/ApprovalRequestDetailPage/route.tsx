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
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Approvals",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/approvals",
            params: { orgId: params.orgId },
            search: {
              section:
                search.policyType === ApprovalPolicyType.CertCodeSigning
                  ? "code-signing"
                  : "certificates"
            }
          })
        },
        {
          label: "Approval Request"
        }
      ]
    };
  }
});
