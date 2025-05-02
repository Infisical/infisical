import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SignupSsoPage } from "./SignUpSsoPage";

const SignupSSOPageQueryParamsSchema = z.object({
  token: z.string(),
  defaultOrgAllowed: z.boolean().optional()
});

export const Route = createFileRoute("/_restrict-login-signup/signup/sso")({
  component: SignupSsoPage,
  validateSearch: zodValidator(SignupSSOPageQueryParamsSchema)
});
