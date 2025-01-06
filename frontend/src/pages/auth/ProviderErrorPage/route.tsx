import { createFileRoute } from "@tanstack/react-router";

import { LoginProviderErrorPage } from "./ProviderErrorPage";

export const Route = createFileRoute("/_restrict-login-signup/login/provider/error")({
  component: LoginProviderErrorPage
});
