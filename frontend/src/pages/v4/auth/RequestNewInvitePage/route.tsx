import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { RequestNewInvitePage } from "./RequestNewInvitePage";

const QueryParamsSchema = z.object({
  reason: z.enum(["expired", "already_member"]).optional()
});

export const Route = createFileRoute("/v4/_v4-auth/requestnewinvite")({
  component: RequestNewInvitePage,
  validateSearch: zodValidator(QueryParamsSchema),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
