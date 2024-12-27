import { createFileRoute } from "@tanstack/react-router";

import { EmailNotVerifiedPage } from "./EmailNotVerifiedPage";

export const Route = createFileRoute("/_restrict-login-signup/email-not-verified")({
  component: EmailNotVerifiedPage
});
