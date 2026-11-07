import { createFileRoute, lazyRouteComponent, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SsoLoginPage } from "../SsoLoginPage";

const QueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  organizationSlug: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/v4/_v4-auth/login/saml")({
  component: () => <SsoLoginPage type="SAML" />,
  validateSearch: zodValidator(QueryParamsSchema),
  search: {
    middlewares: [
      stripSearchParams({
        callback_port: undefined,
        is_admin_login: false,
        organizationSlug: undefined
      })
    ]
  },
  pendingComponent: lazyRouteComponent(() => import("../../../V4PageLoader"), "V4PageLoader")
});
