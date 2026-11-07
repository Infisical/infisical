import { createFileRoute, lazyRouteComponent, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LdapLoginPage } from "./LdapLoginPage";

const QueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  organizationSlug: z.string().catch(""),
  username: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/v4/_v4-auth/login/ldap")({
  component: LdapLoginPage,
  validateSearch: zodValidator(QueryParamsSchema),
  search: {
    middlewares: [
      stripSearchParams({
        callback_port: undefined,
        is_admin_login: false,
        organizationSlug: "",
        username: undefined
      })
    ]
  },
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
