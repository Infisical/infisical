import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SignUpSsoPage } from "./SignUpSsoPage";

const QueryParamsSchema = z.object({
  token: z.string().catch(""),
  defaultOrgAllowed: z.boolean().optional()
});

export const Route = createFileRoute("/v4/_v4-auth/signup/sso")({
  component: SignUpSsoPage,
  validateSearch: zodValidator(QueryParamsSchema),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
