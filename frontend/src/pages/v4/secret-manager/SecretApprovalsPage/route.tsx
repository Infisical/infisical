import { createFileRoute, lazyRouteComponent, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretApprovalsPage } from "./SecretApprovalsPage";

const SecretApprovalPageQueryParams = z.object({
  requestId: z.string().catch(""),
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/approval"
)({
  component: SecretApprovalsPage,
  validateSearch: zodValidator(SecretApprovalPageQueryParams),
  search: { middlewares: [stripSearchParams({ requestId: "", selectedTab: "" })] },
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
