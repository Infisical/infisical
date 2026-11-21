import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";

import { ApprovalRequestDetailPage } from "./ApprovalRequestDetailPage";

const SearchSchema = z.object({
  policyType: z.nativeEnum(ApprovalPolicyType).optional(),
  applicationName: z.string().optional(),
  signerId: z.string().optional(),
  from: z.enum(["root-requests"]).optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/approvals/$approvalRequestId"
)({
  staticData: { readiness: "full" },
  component: ApprovalRequestDetailPage,
  validateSearch: zodValidator(SearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
