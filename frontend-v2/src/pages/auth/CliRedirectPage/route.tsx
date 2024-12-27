import { createFileRoute } from "@tanstack/react-router";

import { CliRedirectPage } from "./CliRedirectPage";

export const Route = createFileRoute("/_restrict-login-signup/cli-redirect")({
  component: CliRedirectPage
});
