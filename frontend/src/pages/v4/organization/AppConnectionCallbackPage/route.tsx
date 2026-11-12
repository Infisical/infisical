import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnectionCallbackPage } from "./AppConnectionCallbackPage";

const AppConnectionCallbackPageQueryParamsSchema = z.object({
  code: z.coerce.string().optional().catch(undefined),
  state: z.string().catch(""),
  installation_id: z.coerce.string().optional().catch(undefined),
  setup_action: z.string().optional().catch(undefined)
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/app-connections/$appConnection/callback"
)({
  staticData: { readiness: "partial", missing: ["Callbacks for apps without a v4 preset"] },
  component: AppConnectionCallbackPage,
  validateSearch: zodValidator(AppConnectionCallbackPageQueryParamsSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
