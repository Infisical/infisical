import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LoginLdapPage } from "./LoginLDAPPage";

const LoginLdapPageQueryParamsSchema = z.object({
  organizationSlug: z.string().catch("")
});

export const Route = createFileRoute("/_restrict-login-signup/login/ldap")({
  component: LoginLdapPage,
  validateSearch: zodValidator(LoginLdapPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ organizationSlug: "" })]
  }
});
