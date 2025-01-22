import { createFileRoute } from "@tanstack/react-router";

import { NoOrgPage } from "./NoOrgPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/none"
)({
  component: NoOrgPage
});
