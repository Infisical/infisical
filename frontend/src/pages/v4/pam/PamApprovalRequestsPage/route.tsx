import { createFileRoute, lazyRouteComponent, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamApprovalRequestsPage } from "./PamApprovalRequestsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/approval-requests")({
  staticData: { readiness: "full" },
  component: PamApprovalRequestsPage,
  validateSearch: zodValidator(z.object({ requestId: z.string().optional().catch(undefined) })),
  search: { middlewares: [stripSearchParams({ requestId: undefined })] },
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
