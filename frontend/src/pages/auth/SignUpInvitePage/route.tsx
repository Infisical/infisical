import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import {
  acceptSignupInvite,
  SignupInvitePageQueryParamsSchema
} from "@app/helpers/authRouteGuards";

import { SignupInvitePage } from "./SignUpInvitePage";

export const Route = createFileRoute("/_restrict-login-signup/signupinvite")({
  component: SignupInvitePage,
  validateSearch: zodValidator(SignupInvitePageQueryParamsSchema),
  beforeLoad: ({ context, search }) => acceptSignupInvite({ context, search })
});
