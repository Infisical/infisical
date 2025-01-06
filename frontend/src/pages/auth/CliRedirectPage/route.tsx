import { createFileRoute } from "@tanstack/react-router";

import { CliRedirectPage } from "./CliRedirectPage";

export const Route = createFileRoute("/cli-redirect")({
  component: CliRedirectPage
});
