import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LoginSsoPage } from "./LoginSsoPage";

const LoginSSOQueryParamsSchema = z.object({
  token: z.string(),
  isAdminLogin: z.boolean().optional().catch(false)
});

export const Route = createFileRoute("/_restrict-login-signup/login/sso")({
  component: LoginSsoPage,
  validateSearch: zodValidator(LoginSSOQueryParamsSchema)
});
