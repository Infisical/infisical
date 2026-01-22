import { createFileRoute } from "@tanstack/react-router";

import { AccountRecoveryPage } from "./AccountRecoveryPage";

export const Route = createFileRoute("/_restrict-login-signup/verify-email")({
  component: AccountRecoveryPage
});
