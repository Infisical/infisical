import { createFileRoute } from "@tanstack/react-router";

import { CliRedirectPage } from "./CliRedirectPage";

export const Route = createFileRoute("/_authenticate/cli-redirect")({
  component: CliRedirectPage
});
