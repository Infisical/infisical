import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AccountRecoveryResetPage } from "./AccountRecoveryResetPage";

const AccountRecoveryResetPageQueryParamsSchema = z.object({
  token: z.string(),
  to: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/account-recovery-reset")({
  component: AccountRecoveryResetPage,
  validateSearch: zodValidator(AccountRecoveryResetPageQueryParamsSchema)
});
