import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LoginSsoPage } from "./LoginSsoPage";

const LoginSsoPageQueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  organizationSlug: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/_restrict-login-signup/login/sso")({
  component: LoginSsoPage,
  validateSearch: zodValidator(LoginSsoPageQueryParamsSchema),
  search: {
    middlewares: [
      stripSearchParams({
        callback_port: undefined,
        is_admin_login: false,
        organizationSlug: undefined
      })
    ]
  }
});
