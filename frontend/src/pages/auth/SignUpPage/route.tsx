import { createFileRoute } from "@tanstack/react-router";

import { SignUpPage } from "./SignUpPage";

export const Route = createFileRoute("/_restrict-login-signup/signup/")({
  component: SignUpPage
});
