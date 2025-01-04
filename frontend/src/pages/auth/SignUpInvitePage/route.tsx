import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SignupInvitePage } from "./SignUpInvitePage";

const SignupInvitePageQueryParamsSchema = z.object({
  token: z.string(),
  to: z.string(),
  organization_id: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/signupinvite")({
  component: SignupInvitePage,
  validateSearch: zodValidator(SignupInvitePageQueryParamsSchema)
});
