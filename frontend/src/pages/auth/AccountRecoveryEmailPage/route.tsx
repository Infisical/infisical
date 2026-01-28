import { createFileRoute } from "@tanstack/react-router";

import { AccountRecoveryEmailPage } from "./AccountRecoveryEmailPage";

export const Route = createFileRoute("/_restrict-login-signup/account-recovery")({
  component: AccountRecoveryEmailPage
});
