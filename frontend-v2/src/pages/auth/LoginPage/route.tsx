import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "./LoginPage";

export const Route = createFileRoute("/_restrict-login-signup/login/")({
  component: LoginPage
});
