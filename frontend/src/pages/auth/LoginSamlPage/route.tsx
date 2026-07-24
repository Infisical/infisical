import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LoginSamlPage } from "./LoginSamlPage";

const LoginSamlPageQueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  organizationSlug: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/_restrict-login-signup/login/saml")({
  component: LoginSamlPage,
  validateSearch: zodValidator(LoginSamlPageQueryParamsSchema),
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
