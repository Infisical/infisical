import { createFileRoute } from "@tanstack/react-router";

import { VerifyEmailPage } from "./VerifyEmailPage";

export const Route = createFileRoute("/_restrict-login-signup/verify-email")({
  component: VerifyEmailPage
});
