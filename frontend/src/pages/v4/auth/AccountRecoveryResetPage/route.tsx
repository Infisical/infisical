import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AccountRecoveryResetPage } from "./AccountRecoveryResetPage";

const QueryParamsSchema = z.object({
  token: z.string().catch(""),
  to: z.string().catch("")
});

export const Route = createFileRoute("/v4/_v4-auth/account-recovery-reset")({
  component: AccountRecoveryResetPage,
  validateSearch: zodValidator(QueryParamsSchema),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
