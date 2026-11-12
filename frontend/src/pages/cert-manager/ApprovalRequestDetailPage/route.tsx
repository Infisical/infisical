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
    const getParent = () => {
      if (search.policyType === ApprovalPolicyType.CertCodeSigning) {
        return {
          label: "Requests",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/requests",
            params: { orgId: params.orgId },
            search: { selectedTab: "signing-requests" as const }
          })
        };
      }
      // Revocation requests only exist in Applications, so they live in Application Requests, not the
      // legacy Approvals page.
      if (search.policyType === ApprovalPolicyType.CertRevocation) {
        return {
          label: "Requests",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/requests",
            params: { orgId: params.orgId },
            search: { selectedTab: "application-requests" as const }
          })
        };
      }
      return {
        label: "Approvals",
        link: linkOptions({
          to: "/organizations/$orgId/cert-manager/approvals",
          params: { orgId: params.orgId }
        })
      };
    };
    const parent = getParent();
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
