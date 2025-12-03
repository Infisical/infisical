import { createFileRoute } from "@tanstack/react-router";

import { NoOrgPage } from "./NoOrgPage";

export const Route = createFileRoute("/_authenticate/organizations/none")({
  component: NoOrgPage
});
