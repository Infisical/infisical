import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LoginProviderSuccessPage } from "./ProviderSuccessPage";

const LoginProviderSuccessQuerySchema = z.object({
  token: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/login/provider/success")({
  component: LoginProviderSuccessPage,
  validateSearch: zodValidator(LoginProviderSuccessQuerySchema)
});
