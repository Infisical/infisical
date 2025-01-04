import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PasswordResetPage } from "./PasswordResetPage";

const PasswordResetPageQueryParamsSchema = z.object({
  token: z.string(),
  to: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/password-reset")({
  component: PasswordResetPage,
  validateSearch: zodValidator(PasswordResetPageQueryParamsSchema)
});
