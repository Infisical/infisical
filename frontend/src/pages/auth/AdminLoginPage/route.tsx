import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "../LoginPage/LoginPage";

export const Route = createFileRoute("/_restrict-login-signup/login/admin")({
  component: () => <LoginPage isAdmin />
});
